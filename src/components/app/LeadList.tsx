'use client';

import { useState, useEffect } from 'react';
import { type Lead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

function formatVehicleName(lead: Lead) {
    // Access the flattened vehicleName property for easy display
    return lead.vehicleName || "Vehicle not specified";
}

export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The backend now saves to the 'email_leads' collection by default.
    const q = query(collection(db, 'email_leads'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      const isFirstLoad = leads.length === 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<Lead, 'id'>;
        
        // The new data structure has a nested 'lead' object.
        // We ensure the top-level fields for the UI are present.
        if (data && data.customerName && data.vehicleName && data.lead) {
            const lead: Lead = {
                id: doc.id,
                ...data
            };

            newLeads.push(lead);

            // Check if it's a genuinely new lead before sending a notification
            const alreadyExists = leads.some(l => l.id === lead.id);
            if (!isFirstLoad && lead.status === 'new' && !alreadyExists) {
                sendNotification({
                    title: `New Lead: ${lead.customerName}`,
                    body: `Interested in: ${formatVehicleName(lead)}`,
                });
            }
        } else {
             console.warn("Filtered out a document with missing or incorrect data structure:", doc.id, doc.data());
        }
      });
      
      setLeads(newLeads);
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError(`Failed to connect to Firestore. Please check your connection and Firebase security rules.`);
    });

    return () => unsubscribe();
  }, []); // Note: `leads` is intentionally not in the dependency array to avoid re-subscribing on every change

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

  const updateLead = async (updatedLead: Lead) => {
    try {
        const leadRef = doc(db, 'email_leads', updatedLead.id);
        // We only update the fields that can change from the UI
        await updateDoc(leadRef, {
            status: updatedLead.status,
            suggestion: updatedLead.suggestion || '',
            'lead.status': updatedLead.status,
            'lead.suggestion': updatedLead.suggestion || ''
        });
    } catch(e) {
        console.error("Failed to update lead: ", e);
    }
  };

  const newLeads = leads.filter(lead => lead.status === 'new');
  const handledLeads = leads.filter(lead => lead.status === 'handled');
  
  if (error) return <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed"><p className="text-destructive">{error}</p></div>

  return (
    <Tabs defaultValue="new" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
        <TabsTrigger value="new">New Leads ({newLeads.length})</TabsTrigger>
        <TabsTrigger value="handled">Handled ({handledLeads.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="new">
        <div className="grid gap-6 pt-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {newLeads.length > 0 ? (
            newLeads.map(lead => <LeadCard key={lead.id} lead={lead} onUpdate={updateLead} />)
          ) : (
            <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground">No new leads. You're all caught up!</p>
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="handled">
        <div className="grid gap-6 pt-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {handledLeads.length > 0 ? (
             handledLeads.map(lead => <LeadCard key={lead.id} lead={lead} onUpdate={updateLead} />)
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
