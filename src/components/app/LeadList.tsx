
'use client';

import { useState, useEffect } from 'react';
import { type Lead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

function isLead(doc: DocumentData): doc is Lead {
    const d = doc as any;
    return d && d.customer && (d.subject || d.vehicle);
}

// Helper to construct a display name for the vehicle
function formatVehicleName(vehicle: Lead['vehicle']) {
    if (!vehicle) return "Vehicle not specified";
    return `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || "Vehicle not specified";
}


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Corrected to listen to the 'leads_v2' collection
    const q = query(collection(db, 'leads_v2'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      const currentLeadIds = new Set(leads.map(l => l.id));

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const docId = doc.id;
        
        if (isLead(data)) {
            const lead: Lead = {
                id: docId,
                customer: data.customer,
                vehicle: data.vehicle,
                subject: data.subject,
                // The AI and card expect a 'comments' field. We can map the 'subject' to it.
                comments: data.subject || 'No comments provided.',
                status: data.status || 'new',
                suggestion: data.suggestion,
                // Use receivedAt for timestamping, falling back to a default if needed
                timestamp: data.receivedAt?.seconds ? data.receivedAt.seconds * 1000 : Date.now(),
                receivedAt: data.receivedAt,
                source: data.source,
                format: data.format,
            };
            newLeads.push(lead);

            // Notification logic
            if (!currentLeadIds.has(lead.id) && lead.status === 'new') {
                const leadTime = new Date(lead.timestamp).getTime();
                const now = Date.now();
                if (now - leadTime < 60000) { // Only notify for leads in the last minute
                    sendNotification({
                        title: `New Lead: ${lead.customer.name || 'Unknown'}`,
                        body: `Interested in: ${formatVehicleName(lead.vehicle)}`,
                    });
                }
            }
        }
      });
      
      setLeads(newLeads);
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError("Failed to connect to Firestore. Please check your connection and Firebase setup.");
    });

    return () => unsubscribe();
  }, [leads]); // `leads` dependency is needed for notification logic

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
        const leadRef = doc(db, 'leads_v2', updatedLead.id);
        await updateDoc(leadRef, {
            status: updatedLead.status,
            suggestion: updatedLead.suggestion || '',
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
