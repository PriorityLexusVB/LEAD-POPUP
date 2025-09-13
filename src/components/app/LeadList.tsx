"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";
import LeadCard from "./LeadCard"; // ensure path
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import type { Lead } from "@/types/lead";
import { getAiSuggestion } from "@/app/actions";
import { doc, updateDoc } from "firebase/firestore";

export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const col = collection(db, "leads_v2");
    const q = query(col, orderBy("createdAtMs", "desc"), limit(100));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          // Fallback query
          getDocs(query(col, orderBy("createdAt", "desc"), limit(100)))
            .then(s2 => {
              const newLeads = s2.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
              setLeads(newLeads);
              setLoading(false);
            })
            .catch(e => {
              setErr(e.message);
              setLoading(false);
            });
          return;
        }
        const newLeads = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
        const isFirstLoad = leads.length === 0;

        newLeads.forEach(newLead => {
          const alreadyExists = leads.some(l => l.id === newLead.id);
          if (!isFirstLoad && newLead.status === 'new' && !alreadyExists) {
              sendNotification({
                  title: `New Lead: ${newLead.customerName}`,
                  body: `Interested in: ${newLead.vehicleOfInterest || 'Not specified'}`,
              });
          }
        });
        
        setLeads(newLeads);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

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

  const handleUpdateLead = async (id: string, updates: { status?: "new" | "handled"; suggestion?: string }) => {
    try {
        const leadRef = doc(db, 'leads_v2', id);
        
        const firestoreUpdates: { [key: string]: any } = {};
        if (updates.status) {
            firestoreUpdates.status = updates.status;
        }
        if (updates.suggestion !== undefined) {
            firestoreUpdates.suggestion = updates.suggestion;
        }
        
        await updateDoc(leadRef, firestoreUpdates);
    } catch(e) {
        console.error("Failed to update lead: ", e);
        setErr(e.message);
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
    } catch (error: any) {
      console.error("Failed to get AI suggestion", error);
      setErr(error.message);
    }
  };

  if (err) return <div className="p-4 text-sm text-red-600">Firestore error: {err}</div>;
  if (loading) return <div className="text-center text-muted-foreground p-8">Loading leads...</div>;

  const newLeads = leads.filter(lead => lead.status === 'new');
  const handledLeads = leads.filter(lead => lead.status === 'handled');

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
