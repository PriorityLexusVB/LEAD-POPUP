'use client';

import { useState, useEffect } from 'react';
import { type Lead, type RawLead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

function parseRawEmail(raw: string, id: string): Lead {
    const customerNameMatch = raw.match(/Name:\s*(.*)/);
    const vehicleMatch = raw.match(/Vehicle:\s*(.*)/);
    const commentsMatch = raw.match(/Comments:\s*([\s\S]*)/);

    // A simple way to get a consistent timestamp from the email Date header
    const dateMatch = raw.match(/Date:\s*(.*)/);
    const timestamp = dateMatch ? new Date(dateMatch[1]).getTime() : Date.now();

    return {
        id,
        customerName: customerNameMatch ? customerNameMatch[1].trim() : 'N/A',
        vehicle: vehicleMatch ? vehicleMatch[1].trim() : 'N/A',
        comments: commentsMatch ? commentsMatch[1].trim() : 'No comments provided',
        status: 'new', // All incoming leads are new
        timestamp,
    };
}


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simplified query without 'orderBy' to prevent index-related issues.
    const q = query(collection(db, 'leads_v2'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      const seenIds = new Set();
      querySnapshot.forEach((doc) => {
        const data = doc.data() as RawLead;
        if (data.raw) {
          const parsedLead = parseRawEmail(data.raw, doc.id);
          if (!seenIds.has(parsedLead.id)) {
            newLeads.push(parsedLead);
            seenIds.add(parsedLead.id)
          }
        }
      });
      setLeads(currentLeads => {
        const leadMap = new Map(currentLeads.map(l => [l.id, l]));
        newLeads.forEach(l => {
             // Check if the lead is new based on timestamp (e.g., within last 5 seconds)
            const isNew = l.timestamp > Date.now() - 5000;
            const existingLead = leadMap.get(l.id);

            if (!existingLead && isNew) {
                 sendNotification({
                    title: `New Lead: ${l.customerName}`,
                    body: `Interested in: ${l.vehicle}`,
                 });
            }
           leadMap.set(l.id, {...(existingLead || {}), ...l});
        });
        // Sort leads on the client-side
        return Array.from(leadMap.values()).sort((a,b) => b.timestamp - a.timestamp);
      });
      setError(null);
    }, (err) => {
      console.error("Error fetching leads from Firestore: ", err);
      setError("Failed to connect to Firestore. Please check your connection and Firebase setup.");
    });

    // Cleanup subscription on unmount
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
