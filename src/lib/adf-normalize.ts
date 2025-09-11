import { XMLParser } from "fast-xml-parser";
import { Lead, QA } from "@/types/lead";

// -------- COMMON UTILS --------
function dedupe(links: (string|undefined)[]) {
  return Array.from(new Set(links.filter(Boolean))) as string[];
}

function safeTrim(s?: string) { return (s ?? "").trim() || undefined; }

function fullName(first?: string, last?: string) {
  return `${safeTrim(first) ?? ""} ${safeTrim(last) ?? ""}`.trim() || "Unknown";
}

type Extracted = {
  narrative?: string;
  clickPaths: string[];
  dashboardLinks: string[];
  qa: { question: string; answer: string }[];
  preferred?: string;
  priceFromBlob?: number | undefined;
};

function extractDealerEProcessCdata(cdata: string): Extracted {
  const rawLines = (cdata || "").split(/\r?\n/);
  const lines = rawLines.map(l => l.replace(/\u00A0/g, " ").trim()).filter(Boolean);

  const clickPaths: string[] = [];
  const dashboardLinks: string[] = [];
  const qa: { question: string; answer: string }[] = [];
  const kept: string[] = [];
  let preferred: string | undefined;
  let priceFromBlob: number | undefined;

  const DROP_PATTERNS: RegExp[] = [
    /primary ppc campaign/i, /secondary ppc campaign/i, /\bsource:\s*adwords?/i,
    /\bclick id:/i, /\bexpires:/i, /\bnetwork type:/i,
    /\blexus dealercode/i, /\blexus sourceid/i,
    /\bvehicle prices\b/i, /^price:\s*\d/i,
    /\bdatetime:/i, /\bsara details:/i, /\beverest dr details:/i,
    /\bcountry:/i, /\bbodystyle:/i, /\btransmission:/i, /\bcondition:/i,
  ];

  const isNoise = (s: string) => DROP_PATTERNS.some(r => r.test(s));
  const urlGrab = (s: string) => s.match(/https?:\/\/\S+/g) || [];
  const hasUrl  = (s: string) => /https?:\/\/\S+/.test(s);

  // Collect Q&A
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.startsWith("click path:")) { clickPaths.push(...urlGrab(line)); continue; }
    if (lower.startsWith("return shopper")) { dashboardLinks.push(...urlGrab(line)); continue; }
    if (/^dashboard lead:/i.test(line)) { dashboardLinks.push(...urlGrab(line)); continue; }

    if (lower.startsWith("preferred contact method:")) { preferred = line.split(":")[1]?.trim(); continue; }
    if (lower === "prefer text") { preferred = "text"; kept.push("Prefer text"); continue; }

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
    if (hasUrl(line)) continue;              // <- never let URL lines into narrative

    kept.push(line);
  }

  // Prefer a message-like answer from QA as narrative
  const MESSAGE_KEYS = /(comment|message|notes?|additional|anything else|questions?)/i;
  const messageFromQA = qa.find(q => MESSAGE_KEYS.test(q.question))?.answer;
  let narrative = (messageFromQA && messageFromQA.toLowerCase() !== "no response" && messageFromQA !== "—")
    ? messageFromQA
    : kept.join("\n").trim() || undefined;

  const uniq = (arr: string[]) => Array.from(new Set(arr));
  return {
    narrative,
    clickPaths: uniq(clickPaths),
    dashboardLinks: uniq(dashboardLinks),
    qa,
    preferred,
    priceFromBlob,
  };
}


// -------- Dealer e-Process ADF (your first sample) --------
export function normalizeDealerEProcess(xml: string): Lead {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = p.parse(xml);
  const prospect = doc?.adf?.prospect ?? {};

  const id = String(prospect?.id ?? "");
  const requestdate = prospect?.requestdate;

  const v = prospect?.vehicle ?? {};
  const c = prospect?.customer ?? {};
  const contact = c?.contact ?? {};

  const { narrative, clickPaths, dashboardLinks, qa, preferred } =
    extractDealerEProcessCdata(String(c?.comments ?? ""));

  const vehicleHeadline = [v?.year, v?.make, v?.model].filter(Boolean).join(" ");

  // name fields can be arrays or objects in ADF — handle both
  const names = Array.isArray(contact?.name) ? contact.name : [contact?.name].filter(Boolean);
  const first = names?.find((n: any) => n?.part === "first")?.["#text"] ?? contact?.name?.first ?? "";
  const last  = names?.find((n: any) => n?.part === "last")?.["#text"]  ?? contact?.name?.last  ?? "";

  return {
    id,
    createdAt: requestdate ?? Date.now(),
    status: "new",
    customerName: `${(first || "").trim()} ${(last || "").trim()}`.trim() || "Unknown",

    email: contact?.email || undefined,
    phone: contact?.phone || undefined,

    preferredContactMethod: preferred,   // "text" / "email" / etc.
    narrative,                            // CLEAN — no PPC junk, no link lines
    clickPathUrls: Array.from(new Set([...clickPaths, ...dashboardLinks])),

    vehicleOfInterest: vehicleHeadline || undefined,
    vehicle: {
      year: v?.year ? Number(v.year) : undefined,
      make: v?.make || undefined,
      model: v?.model || undefined,
      trim: v?.trim || undefined,
      stock: v?.stock || undefined,
      vin: v?.vin || undefined,
      odometer: v?.odometer || undefined,
      price: v?.price || undefined,
    },

    // map when those flags exist in your feed
    previousToyotaCustomer: undefined,
    previousLexusCustomer: undefined,

    tradeIn: undefined, // your shown sample had "Do you have a trade in? no"

    qa,
    cdkLeadId: id,
  };
}


// -------- Lexus STAR ProcessSalesLead (your second sample) --------
export function normalizeLexusSTAR(xml: string): Lead {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc = p.parse(xml);
  const bod = doc?.ProcessSalesLead;
  const hdr = bod?.ProcessSalesLeadDataArea?.SalesLead?.SalesLeadHeader;

  const given = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.GivenName;
  const family = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.FamilyName;
  const email = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.URICommunication?.URIID;
  const phone = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.TelephoneCommunication?.LocalNumber;

  const v = bod?.ProcessSalesLeadDataArea?.SalesLead?.SalesLeadDetail?.SalesLeadLineItem?.SalesLeadVehicleLineItem?.SalesLeadVehicle;
  
  const cc = (hdr?.CustomerComments as string) || "";
  const metaLike = /(Ownership and Service|Number of Leads Previously Submitted)/i;
  const narrative = cc && !metaLike.test(cc) ? cc : undefined;

  const vehicleHeadline = [v?.ModelYear, v?.MakeString || v?.ManufacturerName, v?.Model].filter(Boolean).join(" ");

  return {
    id: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
    createdAt: hdr?.LeadCreationDateTime ?? Date.now(),
    status: "new",
    customerName: fullName(given, family),

    email: safeTrim(email),
    phone: safeTrim(phone),

    narrative: narrative,

    clickPathUrls: [], // STAR sample didn’t include; add if present in your feed

    vehicleOfInterest: vehicleHeadline || undefined,
    vehicle: {
      year: v?.ModelYear ? Number(v.ModelYear) : undefined,
      make: v?.MakeString || v?.ManufacturerName,
      model: v?.Model,
      trim: v?.TrimCode,
      vin: v?.VehicleID,
    },

    // Plug these when fields appear in STAR feed
    previousToyotaCustomer: undefined,
    previousLexusCustomer: undefined,

    tradeIn: undefined,
    qa: [],

    cdkLeadId: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
  };
}
