
"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, orderBy, limit,
  onSnapshot, getDocs, Unsubscribe
} from "firebase/firestore";
import LeadCard from "./LeadCard";

type Lead = any;

export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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


  const handleUpdateLead = async (id: string, updates: { status?: "new" | "handled"; suggestion?: string }) => {
    // This function is not fully implemented in the provided snippet
    // but is kept here to avoid breaking other parts of the UI.
    console.log(`Updating lead ${id} with`, updates);
  };

  const handleSuggestReply = async (lead: Lead) => {
    // This function is not fully implemented in the provided snippet
    // but is kept here to avoid breaking other parts of the UI.
    console.log("Suggesting reply for", lead.id);
  };

  if (err) return <div className="p-3 text-sm text-red-600">Firestore error: {err}</div>;
    if (loading) return <div className="text-center text-muted-foreground p-8">Loading leads...</div>;

  const newLeads = leads.filter(lead => lead.status === 'new');
  const handledLeads = leads.filter(lead => lead.status === 'handled');

  return (
    <div className="w-full">
      <div className="space-y-3">
        {leads.length > 0 ? (
          leads.map(lead => <LeadCard key={lead.id} lead={lead} onSuggestReply={handleSuggestReply} onMarkHandled={(id) => handleUpdateLead(id, { status: 'handled' })} />)
        ) : (
          <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground">No leads found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
