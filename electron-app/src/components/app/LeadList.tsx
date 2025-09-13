
"use client";
import { useEffect, useState, useTransition } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, orderBy, limit,
  onSnapshot, getDocs, Unsubscribe
} from "firebase/firestore";
import LeadCard from "./LeadCard";
import type { Lead } from "@/types/lead";
import { getAiSuggestion, setLeadStatus } from "@/actions";
import { useToast } from "@/hooks/use-toast";


export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const col = collection(db, "leads_v2");
    const q = query(col, orderBy("createdAtMs", "desc"), limit(100));

    let unsub: Unsubscribe | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const apply = (docs: any[]) => {
      const newLeads = docs.map(d => ({ id: d.id, ...d.data() }));
      setLeads(newLeads);
      setLoading(false);
    };

    const startPolling = async () => {
      console.warn("[firestore] using manual polling fallback (15s)");
      const run = async () => {
        try {
          const snap = await getDocs(q);
          apply(snap.docs);
        } catch (e: any) {
          setErr(e?.message || String(e));
          setLoading(false);
        }
      };
      await run();
      timer = setInterval(run, 15000);
    };

    const startRealtime = () => {
      unsub = onSnapshot(
        q,
        (snap) => {
          if (snap.empty) {
            // Fallback query if createdAtMs is not present on some documents
            getDocs(query(col, orderBy("createdAt", "desc"), limit(100)))
              .then(s2 => apply(s2.docs))
              .catch(e => {
                setErr(e.message);
                setLoading(false);
              });
            return;
          }
          apply(snap.docs);
        },
        (e) => {
          console.warn("[firestore] onSnapshot transport error; falling back to polling", e);
          if (unsub) { try { unsub(); } catch {} }
          startPolling();
        }
      );
    };

    startRealtime();

    return () => {
      if (unsub) try { unsub(); } catch {}
      if (timer) clearInterval(timer);
    };
  }, []);

  const handleMarkHandled = async (id: string) => {
    try {
      await setLeadStatus(id, 'handled');
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status: 'handled' } : l));
    } catch (error) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to mark lead as handled.",
        });
    }
  };

  const handleSuggestReply = async (lead: Lead) => {
    try {
        const suggestion = await getAiSuggestion({
            customerName: lead.customerName,
            vehicle: lead.vehicleOfInterest || '',
            comments: lead.narrative || '',
        });
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, suggestion } : l));
    } catch (error) {
        toast({
            variant: "destructive",
            title: "AI Error",
            description: (error as Error).message,
        });
    }
  };

  if (err) return <div className="p-3 text-sm text-red-600">Firestore error: {err}</div>;
  if (loading) return <div className="text-center text-muted-foreground p-8">Loading leads...</div>;

  return (
    <div className="w-full">
      <div className="space-y-3">
        {leads.length > 0 ? (
          leads.map(lead => <LeadCard key={lead.id} lead={lead} onSuggestReply={handleSuggestReply} onMarkHandled={handleMarkHandled} />)
        ) : (
          <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground">No leads found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
