
'use client';

import { useState, useEffect } from 'react';
import { type Lead, type LeadStatus, type LeadQA } from "@/types/lead";
import type { RawFirestoreLead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

// This function converts the raw, nested Firestore data into the clean, flat Lead object for the UI.
function normalizeFirestoreLead(doc: DocumentData): Lead {
    const data = doc.data() as RawFirestoreLead;
    const leadData = data.lead;

    const qa: LeadQA[] = leadData.optionalQuestions?.map(q => ({
        question: q.question,
        answer: q.response || q.check || "Not answered",
    })) || [];
    
    return {
        id: doc.id,
        createdAt: data.receivedAt ? new Date(data.receivedAt.seconds * 1000) : new Date(data.timestamp),
        status: data.status,
        suggestion: data.suggestion,
        customerName: data.customerName,
        vehicleOfInterest: data.vehicleName,
        email: leadData.customer.email || undefined,
        phone: leadData.customer.phonePretty || undefined,
        tradeIn: leadData.tradeIn ? {
            year: leadData.tradeIn.year || undefined,
            make: leadData.tradeIn.make || undefined,
            model: leadData.tradeIn.model || undefined,
        } : undefined,
        campaignSource: leadData.marketing.primaryCampaignSource || undefined,
        clickPathUrl: leadData.marketing.clickPathUrl || undefined,
        narrative: leadData.comments || undefined,
        qa: qa,
        cdkLeadId: leadData.meta.adfId, // Assuming adfId can be used as cdkLeadId
    };
}


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'email_leads'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const isFirstLoad = leads.length === 0;
      const newLeads: Lead[] = [];

      querySnapshot.forEach((doc) => {
        try {
            const normalizedLead = normalizeFirestoreLead(doc);
            newLeads.push(normalizedLead);

             // Check if it's a genuinely new lead before sending a notification
            const alreadyExists = leads.some(l => l.id === normalizedLead.id);
            if (!isFirstLoad && normalizedLead.status === 'new' && !alreadyExists) {
                sendNotification({
                    title: `New Lead: ${normalizedLead.customerName}`,
                    body: `Interested in: ${normalizedLead.vehicleOfInterest || 'Not specified'}`,
                });
            }
        } catch (e) {
            console.error("Failed to normalize lead document:", doc.id, e);
        }
      });
      
      setLeads(newLeads);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError(`Failed to connect to Firestore. Please check your connection and Firebase security rules.`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); // Note: `leads` is intentionally not in the dependency array

  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        const permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          await requestPermission();
        }
      } catch (e) {
        console.error("Could not request notification permissions, probably not in Tauri.", e)
      }
    };
    requestNotificationPermission();
  }, []);

  const handleUpdateLead = async (id: string, updates: { status?: LeadStatus; suggestion?: string }) => {
    try {
        const leadRef = doc(db, 'email_leads', id);
        
        const firestoreUpdates: { [key: string]: any } = {};
        if (updates.status) {
            firestoreUpdates.status = updates.status;
            firestoreUpdates['lead.status'] = updates.status;
        }
        if (updates.suggestion) {
            firestoreUpdates.suggestion = updates.suggestion;
        }
        
        await updateDoc(leadRef, firestoreUpdates);
    } catch(e) {
        console.error("Failed to update lead: ", e);
    }
  };

  const newLeads = leads.filter(lead => lead.status === 'new');
  const handledLeads = leads.filter(lead => lead.status === 'handled');
  
  if (loading) {
    return <div className="text-center text-muted-foreground p-8">Loading leads...</div>;
  }
  if (error) {
    return <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed"><p className="text-destructive">{error}</p></div>
  }

  return (
    <Tabs defaultValue="new" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="new">New Leads ({newLeads.length})</TabsTrigger>
        <TabsTrigger value="handled">Handled ({handledLeads.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="new" className="pt-4">
        <div className="grid gap-4 md:grid-cols-1">
          {newLeads.length > 0 ? (
            newLeads.map(lead => <LeadCard key={lead.id} lead={lead} onUpdate={handleUpdateLead} />)
          ) : (
            <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground">No new leads. You're all caught up!</p>
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="handled" className="pt-4">
        <div className="grid gap-4 md:grid-cols-1">
          {handledLeads.length > 0 ? (
             handledLeads.map(lead => <LeadCard key={lead.id} lead={lead} onUpdate={handleUpdateLead} />)
          ) : (
             <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground">No leads have been handled yet.</p>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
