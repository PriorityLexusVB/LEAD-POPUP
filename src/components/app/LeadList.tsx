
'use client';

import { useState, useEffect } from 'react';
import { type Lead, type RawLead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, DocumentData, updateDoc, doc } from 'firebase/firestore';

function isLead(doc: DocumentData): doc is Lead {
  return doc && doc.customerName && doc.vehicle && doc.comments;
}

export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'email_leads'), orderBy('receivedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const newLeads: Lead[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (isLead(data)) {
          newLeads.push({ id: doc.id, ...data } as Lead);
        } else {
            // Handle raw or malformed data gracefully
            const rawData = data as RawLead;
            const receivedAt = rawData.receivedAt || { seconds: Date.now() / 1000, nanoseconds: 0 };
            newLeads.push({
                id: doc.id,
                customerName: 'Unparsed Lead',
                vehicle: 'Check comments for details',
                comments: rawData.raw || 'No raw data found.',
                status: 'new',
                timestamp: receivedAt.seconds * 1000,
                receivedAt: receivedAt,
                source: rawData.source || 'unknown-source',
            });
        }
      });

      setLeads(currentLeads => {
        const leadMap = new Map(currentLeads.map(l => [l.id, l]));
        let hasNewLead = false;
        newLeads.forEach(l => {
            const existingLead = leadMap.get(l.id);
            if (!existingLead && l.status === 'new') {
                 // Check if the lead is very recent (e.g., within the last minute)
                 // to avoid sending notifications for old "new" leads on first load.
                 const leadTime = new Date(l.timestamp).getTime();
                 const now = Date.now();
                 if (now - leadTime < 60000) {
                    hasNewLead = true;
                 }
            }
           leadMap.set(l.id, {...(existingLead || {}), ...l});
        });
        
        const sortedLeads = Array.from(leadMap.values()).sort((a,b) => b.timestamp - a.timestamp)
        
        // Only send notification if there was a genuinely new lead in this snapshot
        if (hasNewLead) {
             const latestLead = sortedLeads.find(l => !currentLeads.some(old => old.id === l.id));
             if (latestLead) {
                sendNotification({
                    title: `New Lead: ${latestLead.customerName}`,
                    body: `Interested in: ${latestLead.vehicle}`,
                });
             }
        }

        return sortedLeads;
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
      try {
        const permissionGranted = await isPermissionGranted();
        if (!permissionGranted) {
          const permission = await requestPermission();
          if (permission !== 'granted') {
            console.log('Notification permission was not granted.');
          }
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
        // The onSnapshot listener will automatically update the UI
    } catch(e) {
        console.error("Failed to update lead: ", e);
        // Optionally show an error to the user
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
