import { XMLParser } from "fast-xml-parser";

export type LeadStatus = "new" | "handled";
export type QA = { question: string; answer: string };

export interface VehicleDetails {
  year?: number; make?: string; model?: string; trim?: string;
  stock?: string; vin?: string; odometer?: string | number; price?: string | number;
  exteriorColor?: string; interiorColor?: string;
}
export interface TradeIn {
  year?: number; make?: string; model?: string; trim?: string; vin?: string; mileage?: string | number;
}
export interface Lead {
  id: string;
  createdAt: string | number | Date;
  status: LeadStatus;

  customerName: string;
  email?: string;
  phone?: string;
  preferredContactMethod?: string;

  narrative?: string;            // only shopper words ("Prefer text" if applicable)
  clickPathUrls?: string[];

  vehicleOfInterest?: string;
  vehicle?: VehicleDetails;
  previousToyotaCustomer?: boolean;
  previousLexusCustomer?: boolean;

  tradeIn?: TradeIn;
  qa?: QA[];

  cdkUrl?: string;
  cdkLeadId?: string;
}

/* ---------- utils ---------- */
const uniq = <T,>(a: T[]) => Array.from(new Set(a));
const safe = (s?: string) => (s ?? "").trim() || undefined;
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

const MESSAGE_KEYS = /(comment|message|notes?|anything else|questions?)/i;
const normAns = (a?: string) => {
  const s = (a || "").trim().replace(/^"|"$/g, "");
  if (!s || /^(no|none|n\/a|na|no response)$/i.test(s)) return undefined;
  return s;
};

/* =========================================================
   Dealer e-Process <adf>
   ========================================================= */
type DEPExtract = {
  narrative?: string;
  clickPaths: string[];
  dashboardLinks: string[];
  qa: QA[];
  preferred?: string;
  priceFromBlob?: number | undefined;
};

function extractDEP(cdata: string): DEPExtract {
  const rawLines = (cdata || "").split(/\r?\n/);
  const lines = rawLines.map(l => l.replace(/\u00A0/g, " ").trim()).filter(Boolean);

  const clickPaths: string[] = [];
  const dashboardLinks: string[] = [];
  const qa: QA[] = [];
  let preferred: string | undefined;
  let priceFromBlob: number | undefined;

  const NOISE = [
    /primary ppc campaign/i, /secondary ppc campaign/i,
    /^source:/i, /^price:/i, /\bclick id:/i, /\bexpires:/i, /\bnetwork type:/i,
    /\blexus dealercode/i, /\blexus sourceid/i, /\bvehicle prices\b/i,
    /\bdatetime:/i, /\bsara details:/i, /\beverest dr details:/i,
    /\bcountry:/i, /\bbodystyle:/i, /\btransmission:/i, /\bcondition:/i,
  ];
  const isNoise = (s: string) => NOISE.some(r => r.test(s));
  const urlsOf = (s: string) => s.match(/https?:\/\/\S+/g) || [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const lower = line.toLowerCase();

    if (lower.startsWith("click path:")) { clickPaths.push(...urlsOf(line)); continue; }
    if (lower.startsWith("return shopper")) { dashboardLinks.push(...urlsOf(line)); continue; }
    if (/^dashboard lead:/i.test(line)) { dashboardLinks.push(...urlsOf(line)); continue; }

    if (lower.startsWith("preferred contact method:")) { preferred = line.split(":")[1]?.trim(); continue; }
    if (lower === "prefer text") { preferred = "text"; continue; }

    if (/^optional questions/i.test(line)) continue;
    if (/^question:/i.test(line)) {
      const q = line.replace(/^question:\s*/i, "").trim();
      let a = "—";
      let j = i + 1;
      while (j < lines.length && !/^question:/i.test(lines[j])) {
        const ln = lines[j];
        if (/^response:/i.test(ln)) a = ln.replace(/^response:\s*/i, "").replace(/^"|"$/g, "").trim() || "—";
        if (/^check:/i.test(ln)) {
          const val = ln.split(":")[1]?.trim();
          if (val && val.toLowerCase() !== "no" && a === "—") a = val;
        }
        j++;
      }
      qa.push({ question: q, answer: a });
      i = j - 1;
      continue;
    }

    if (/^vehicle prices\b/i.test(line)) {
      for (let k = i + 1; k < Math.min(lines.length, i + 6); k++) {
        const m = lines[k].match(/^\s*price:\s*([\d,]+(?:\.\d+)?)/i);
        if (m) { const num = Number(m[1].replace(/,/g, "")); if (!Number.isNaN(num)) priceFromBlob = num; break; }
      }
      continue;
    }

    if (isNoise(line)) continue;
  }

  const msgFromQA = normAns(qa.find(q => MESSAGE_KEYS.test(q.question))?.answer);
  const narrative = msgFromQA ?? (preferred === "text" ? "Prefer text" : undefined);

  return {
    narrative,
    clickPaths: uniq(clickPaths),
    dashboardLinks: uniq(dashboardLinks),
    qa,
    preferred,
    priceFromBlob,
  };
}

export function normalizeDealerEProcess(xmlStr: string): Lead {
  const doc = xml.parse(xmlStr);
  const prospect = doc?.adf?.prospect ?? {};
  const id = String(prospect?.id ?? "");
  const requestdate = prospect?.requestdate;

  const v = prospect?.vehicle ?? {};
  const c = prospect?.customer ?? {};
  const contact = c?.contact ?? {};

  const { narrative, clickPaths, dashboardLinks, qa, preferred, priceFromBlob } =
    extractDEP(String(c?.comments ?? ""));

  const names = Array.isArray(contact?.name) ? contact.name : [contact?.name].filter(Boolean);
  const first = names?.find((n: any) => n?.part === "first")?.["#text"] ?? contact?.name?.first ?? "";
  const last  = names?.find((n: any) => n?.part === "last")?.["#text"]  ?? contact?.name?.last  ?? "";

  const headline = [v?.year, v?.make, v?.model].filter(Boolean).join(" ");

  return {
    id,
    createdAt: requestdate ?? new Date().toISOString(),
    status: "new",
    customerName: `${first} ${last}`.trim() || "Unknown",

    email: contact?.email || undefined,
    phone: contact?.phone || undefined,
    preferredContactMethod: preferred,

    narrative,
    clickPathUrls: uniq([...clickPaths, ...dashboardLinks]),

    vehicleOfInterest: headline || undefined,
    vehicle: {
      year: v?.year ? Number(v.year) : undefined,
      make: v?.make || undefined,
      model: v?.model || undefined,
      trim: v?.trim || undefined,
      stock: v?.stock || undefined,
      vin: v?.vin || undefined,
      odometer: v?.odometer || undefined,
      price: (v?.price ?? undefined) ?? priceFromBlob,
    },

    previousToyotaCustomer: undefined,
    previousLexusCustomer: undefined,

    tradeIn: undefined,
    qa,
    cdkLeadId: id,
  };
}

/* =========================================================
   Lexus STAR <ProcessSalesLead>
   ========================================================= */
function extractXmlSegment(raw: string, root: string) {
  const m = raw.match(new RegExp(`<${root}[\\s\\S]*?<\\/${root}>`, "m"));
  return m ? m[0] : raw;
}
function mapPreferredContact(s?: string) {
  const v = (s || "").toLowerCase();
  if (v.includes("email")) return "email";
  if (v.includes("phone") || v.includes("day phone") || v.includes("cell")) return "phone";
  if (v.includes("text")) return "text";
  return safe(s);
}
function sanitizeStarComments(s?: string) {
  if (!s) return undefined;
  let t = s.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
  const DROP = [
    /ownership and service history not available/i,
    /unknown vehicle/i,
    /number of leads previously submitted/i,
  ];
  for (const r of DROP) t = t.replace(r, "").trim();
  t = t.replace(/^comments:\s*/i, "").trim();
  return t.length >= 3 ? t : undefined;
}
function extractStarTail(raw: string) {
  const out: { preferred?: string; comments?: string } = {};
  const parts = raw.split(/<\/ProcessSalesLead>/i);
  if (parts.length < 2) return out;
  const tail = parts[1];
  out.preferred = tail.match(/Preferred Contact:\s*(.+)/i)?.[1]?.trim();
  out.comments  = tail.match(/CUSTOMER COMMENT INFORMATION[\s\S]*?Comments:\s*([\s\S]*?)(?:\n{2,}|\r{2,}|$)/i)?.[1]?.trim();
  return out;
}

export function normalizeLexusSTAR(raw: string): Lead {
  const xmlStr = extractXmlSegment(raw, "ProcessSalesLead");
  const doc: any = xml.parse(xmlStr);

  const area = doc?.ProcessSalesLead?.ProcessSalesLeadDataArea;
  const hdr  = area?.SalesLead?.SalesLeadHeader;
  const veh  = area?.SalesLead?.SalesLeadDetail?.SalesLeadLineItem?.SalesLeadVehicleLineItem?.SalesLeadVehicle;

  const given  = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.GivenName;
  const family = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.FamilyName;
  const email  = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.URICommunication?.URIID;
  const phone  = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.TelephoneCommunication?.LocalNumber;
  const prefXml= hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.ContactMethodTypeCode;

  const xmlNarr = sanitizeStarComments(hdr?.CustomerComments);
  const tail    = extractStarTail(raw);
  const tailNarr= sanitizeStarComments(tail.comments);
  const narrative = tailNarr ?? xmlNarr ?? undefined;

  const year = veh?.ModelYear ? Number(veh.ModelYear) : undefined;
  const make = veh?.MakeString || veh?.ManufacturerName;
  const model= veh?.Model;
  const trim = veh?.TrimCode;
  const vin  = veh?.VehicleID;
  const headline = [year, make, model, trim].filter(Boolean).join(" ");

  return {
    id: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
    createdAt: hdr?.LeadCreationDateTime || hdr?.DocumentDateTime || new Date().toISOString(),
    status: "new",
    customerName: `${safe(given) ?? ""} ${safe(family) ?? ""}`.trim() || "Unknown",

    email: safe(email),
    phone: safe(phone),
    preferredContactMethod: mapPreferredContact(tail.preferred ?? prefXml),

    narrative,
    clickPathUrls: [],

    vehicleOfInterest: headline || undefined,
    vehicle: { year, make, model, trim, vin },

    previousToyotaCustomer: undefined,
    previousLexusCustomer: undefined,

    tradeIn: undefined,
    qa: [],
    cdkLeadId: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
  };
}

/* Auto-detect */
export function normalizeAny(rawBody: string): Lead | null {
  if (!rawBody) return null;
  if (rawBody.includes("<adf")) return normalizeDealerEProcess(rawBody);
  if (rawBody.includes("<ProcessSalesLead")) return normalizeLexusSTAR(rawBody);
  return null;
}
