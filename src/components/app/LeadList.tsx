
'use client';

import { useState, useEffect } from 'react';
import { type Lead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

function isLead(data: DocumentData): data is Lead {
    return (
        data &&
        typeof data.id === 'string' &&
        data.customer &&
        typeof data.customer.name === 'string' &&
        data.vehicle &&
        typeof data.vehicle.make === 'string'
    );
}

function formatVehicleName(vehicle: Lead['vehicle']) {
    if (!vehicle) return "Vehicle not specified";
    return `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || "Vehicle not specified";
}


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'email_leads'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      const isFirstLoad = leads.length === 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const lead: Lead = {
            id: doc.id,
            customer: data.customer,
            vehicle: data.vehicle,
            comments: data.comments,
            status: data.status,
            suggestion: data.suggestion,
            timestamp: data.timestamp,
            receivedAt: data.receivedAt,
            source: data.source,
            format: data.format,
        };

        if (isLead(lead)) {
            newLeads.push(lead);

            // Notify for new leads after the initial data load
            const alreadyExists = leads.some(l => l.id === lead.id);
            if (!isFirstLoad && lead.status === 'new' && !alreadyExists) {
                sendNotification({
                    title: `New Lead: ${lead.customer.name || 'Unknown'}`,
                    body: `Interested in: ${formatVehicleName(lead.vehicle)}`,
                });
            }
        }
      });
      
      setLeads(newLeads);
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError(`Failed to connect to Firestore: ${err.message}`);
    });

    return () => unsubscribe();
  }, []); // isFirstLoad dependency removed to avoid re-subscribing.

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
