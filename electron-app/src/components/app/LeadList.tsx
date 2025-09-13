import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, orderBy, limit,
  onSnapshot, getDocs, Unsubscribe
} from "firebase/firestore";

type Lead = any;

function LeadRow({ lead }: { lead: Lead }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="font-medium">{lead.customerName ?? "Unknown"}</div>
      <div className="text-sm text-muted-foreground">{lead.vehicleOfInterest ?? "—"}</div>
    </div>
  );
}

export default function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"realtime" | "polling">("realtime");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const col = collection(db, "leads_v2");
    const q = query(col, orderBy("createdAtMs", "desc"), limit(100));

    let unsub: Unsubscribe | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const apply = (docs: any[]) => {
      setLeads(docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };

    const startPolling = async () => {
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
      setMode("polling");
    };

    if (import.meta.env.VITE_FIRESTORE_POLL_ONLY === "1") {
      startPolling();
      return () => { if (timer) clearInterval(timer); };
    }

    unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          getDocs(query(col, orderBy("createdAt", "desc"), limit(100)))
            .then(s2 => apply(s2.docs))
            .catch(e => {
              setErr(e.message);
              setLoading(false);
            });
          return;
        }
        apply(snap.docs);
        setMode("realtime");
      },
      (e) => {
        console.warn("[firestore] onSnapshot error; falling back to polling", e);
        if (unsub) { try { unsub(); } catch {} }
        startPolling();
      }
    );

    return () => {
      if (unsub) try { unsub(); } catch {}
      if (timer) clearInterval(timer);
    };
  }, []);

  if (loading) return <div className="text-center text-muted-foreground p-8">Loading leads...</div>;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Mode: {mode} {err && <span className="text-red-600">• {err}</span>}
      </div>
      {leads.length ? leads.map(l => <LeadRow key={l.id} lead={l} />) :
        <div className="text-sm text-muted-foreground">No leads yet.</div>}
    </div>
  );
}
