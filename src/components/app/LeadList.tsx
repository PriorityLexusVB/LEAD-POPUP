
'use client';

import { useState, useEffect } from 'react';
import { type Lead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'email_leads'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        newLeads.push({ id: doc.id, ...data } as Lead);
      });

      setLeads(currentLeads => {
        const leadMap = new Map(currentLeads.map(l => [l.id, l]));
        newLeads.forEach(l => {
             const isNew = l.timestamp > Date.now() - 10000; // 10 second window
            const existingLead = leadMap.get(l.id);

            if (!existingLead && isNew) {
                 sendNotification({
                    title: `New Lead: ${l.customerName}`,
                    body: `Interested in: ${l.vehicle}`,
                 });
            }
           leadMap.set(l.id, {...(existingLead || {}), ...l});
        });
        
        return Array.from(leadMap.values()).sort((a,b) => b.timestamp - a.timestamp);
      });
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError("Failed to connect to Firestore. Please check your connection and Firebase setup.");
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const requestNotificationPermission = async () => {
      const permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        if (permission !== 'granted') {
          console.log('Notification permission was not granted.');
        }
      }
    };
    requestNotificationPermission();
  }, []);

  const updateLead = (updatedLead: Lead) => {
    setLeads(leads.map(lead => (lead.id === updatedLead.id ? updatedLead : lead)));
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
