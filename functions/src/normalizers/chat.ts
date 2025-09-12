import type { Lead } from "./adf";

const dedupe = <T,>(a: T[]) => Array.from(new Set(a));
const safe = (s?: string) => (s ?? "").trim() || undefined;
const yes  = (s?: string) => String(s || "").trim().toLowerCase().startsWith("y");
const num  = (s?: string) => { const n = Number(String(s||"").replace(/[^0-9.]/g,"")); return Number.isFinite(n) ? n : undefined; };

export function looksLikeChatLead(subject?: string, fromAddr?: string, body?: string) {
  const s = (subject || "").toLowerCase();
  const f = (fromAddr || "").toLowerCase();
  const b = (body || "").toLowerCase();
  return s.includes("chat lead") || s.includes("gubagoo") || f.includes("gubagoo") || b.includes("chat transcript");
}

export function normalizeChatPlain(opts: {
  msgId: string;
  subject?: string;
  from?: string;
  text: string;
  receivedAt?: string | number | Date;
}): Lead | null {
  const { msgId, subject, text, receivedAt } = opts;
  if (!text) return null;

  const urls = dedupe(Array.from(text.matchAll(/https?:\/\/\S+/g)).map(m => m[0]));
  const lines = text.replace(/\r/g, "").split("\n");
  const keyRe = /^(Name|First Name|Last Name|Email|E-mail|Phone|Preferred|Preferred Contact|Message|Comments?|Year|Make|Model|Trim|VIN|Stock|Odometer|Mileage|Price|Previous (Toyota|Lexus) Customer)\s*:\s*(.*)$/i;

  let capturingMsg = false;
  const msg: string[] = [];
  const data: any = {};

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (capturingMsg) msg.push(""); continue; }
    const m = line.match(keyRe);
    if (m) {
      if (capturingMsg) capturingMsg = false;
      const key = m[1].toLowerCase();
      const val = m[3]?.trim();
      switch (key) {
        case "name": data.name = val; break;
        case "first name": data.first = val; break;
        case "last name": data.last = val; break;
        case "email": case "e-mail": data.email = val; break;
        case "phone": data.phone = val; break;
        case "preferred": case "preferred contact": data.pref = val; break;
        case "message": case "comment": case "comments": capturingMsg = true; if (val) msg.push(val); break;
        case "year": data.year = num(val); break;
        case "make": data.make = val; break;
        case "model": data.model = val; break;
        case "trim": data.trim = val; break;
        case "vin": data.vin = val; break;
        case "stock": data.stock = val; break;
        case "odometer": case "mileage": data.odo = val; break;
        case "price": data.price = num(val) ?? val; break;
        case "previous toyota customer": data.prevToyota = yes(val); break;
        case "previous lexus customer": data.prevLexus = yes(val); break;
      }
      continue;
    }
    if (capturingMsg) msg.push(line);
  }

  const message = safe(msg.join("\n"));
  const name = safe(data.name) || [safe(data.first), safe(data.last)].filter(Boolean).join(" ") || "Unknown";
  const headline = [data.year, data.make, data.model, data.trim].filter(Boolean).join(" ") || undefined;

  const lead: Lead = {
    id: msgId || String(Date.now()),
    createdAt: receivedAt ?? new Date().toISOString(),
    status: "new",
    customerName: name,
    email: safe(data.email),
    phone: safe(data.phone),
    preferredContactMethod: safe(data.pref)?.toLowerCase(),
    narrative: message || undefined,
    clickPathUrls: urls,
    vehicleOfInterest: headline,
    vehicle: { year: data.year, make: data.make, model: data.model, trim: data.trim, vin: safe(data.vin), stock: safe(data.stock), odometer: safe(data.odo), price: data.price },
    previousToyotaCustomer: data.prevToyota,
    previousLexusCustomer: data.prevLexus,
    tradeIn: undefined,
    qa: [],
    cdkLeadId: undefined,
  };
  return lead.email || lead.phone || lead.narrative || lead.vehicleOfInterest ? lead : null;
}
