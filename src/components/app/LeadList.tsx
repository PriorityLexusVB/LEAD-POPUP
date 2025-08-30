'use client';

import { useState, useEffect } from 'react';
import { type Lead } from '@/lib/types';
import LeadCard from './LeadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {isPermissionGranted, requestPermission, sendNotification} from '@tauri-apps/api/notification';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function LeadList({ initialLeads }: { initialLeads: Lead[] }) {
  const { data, error } = useSWR('/api/leads', fetcher, { refreshInterval: 5000 });
  const [leads, setLeads] = useState<Lead[]>(initialLeads.sort((a, b) => b.timestamp - a.timestamp));

  useEffect(() => {
    if (data?.leads) {
      // Basic merge to avoid duplicates and keep client-side updates
      setLeads(prevLeads => {
        const leadMap = new Map(prevLeads.map(l => [l.id, l]));
        data.leads.forEach((l: Lead) => {
            if (!leadMap.has(l.id)) {
                leadMap.set(l.id, l);
            }
        });
        return Array.from(leadMap.values()).sort((a, b) => b.timestamp - a.timestamp);
      });
    }
  }, [data]);


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

  useEffect(() => {
    if (data?.leads) {
      const latestLead = data.leads[0];
      const fiveSecondsAgo = Date.now() - 5000;
      if (latestLead && latestLead.timestamp > fiveSecondsAgo) {
         sendNotification({
            title: `New Lead: ${latestLead.customerName}`,
            body: `Interested in: ${latestLead.vehicle}`,
         });
      }
    }
  }, [data]);

  if (error) return <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed"><p className="text-destructive-foreground">Failed to load leads.</p></div>

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
