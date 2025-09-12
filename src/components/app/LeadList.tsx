
'use client';

import { useState, useEffect } from 'react';
import { type Lead, type LeadStatus } from "@/types/lead";
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

function normalizeFirestoreLead(doc: DocumentData): Lead {
    const data = doc.data();

    // Firestore timestamps need to be converted to JS Dates.
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();

    const lead: Lead = {
        id: doc.id,
        createdAt: createdAt,
        status: data.status || 'new',
        customerName: data.customerName || 'Unknown Lead',
        email: data.email,
        phone: data.phone,
        preferredContactMethod: data.preferredContactMethod,
        narrative: data.narrative,
        clickPathUrls: data.clickPathUrls || [],
        vehicleOfInterest: data.vehicleOfInterest,
        vehicle: data.vehicle,
        previousToyotaCustomer: data.previousToyotaCustomer,
        previousLexusCustomer: data.previousLexusCustomer,
        tradeIn: data.tradeIn,
        qa: data.qa || [],
        cdkLeadId: data.cdkLeadId,
        vendor: data.vendor,
        subSource: data.subSource,
        channel: data.channel,
        suggestion: data.suggestion,
    };

    return lead;
}


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Note: Reading from 'leads_v2' as per the backend implementation.
    const q = query(collection(db, 'leads_v2'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const isFirstLoad = leads.length === 0;
      const newLeads: Lead[] = [];

      querySnapshot.forEach((doc) => {
        try {
            const normalizedLead = normalizeFirestoreLead(doc);
            newLeads.push(normalizedLead);

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
  }, []); // `leads` is intentionally not in the dependency array

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
        const leadRef = doc(db, 'leads_v2', id);
        
        const firestoreUpdates: { [key: string]: any } = {};
        if (updates.status) {
            firestoreUpdates.status = updates.status;
        }
        if (updates.suggestion) {
            firestoreUpdates.suggestion = updates.suggestion;
        }
        
        await updateDoc(leadRef, firestoreUpdates);
    } catch(e) {
        console.error("Failed to update lead: ", e);
    }
  };

  const handleSuggestReply = async (lead: Lead) => {
    try {
      const suggestion = await getAiSuggestion({
          customerName: lead.customerName,
          vehicle: lead.vehicleOfInterest || "vehicle",
          comments: lead.narrative || "No comments provided",
      });
      await handleUpdateLead(lead.id, { suggestion });
    } catch (error) {
      console.error("Failed to get AI suggestion", error);
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
            newLeads.map(lead => <LeadCard key={lead.id} lead={lead} onSuggestReply={handleSuggestReply} onMarkHandled={(id) => handleUpdateLead(id, { status: 'handled' })} />)
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
             handledLeads.map(lead => <LeadCard key={lead.id} lead={lead} onSuggestReply={handleSuggestReply} onMarkHandled={(id) => handleUpdateLead(id, { status: 'handled' })} />)
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
