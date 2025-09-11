import { XMLParser } from "fast-xml-parser";
import { Lead, QA } from "@/types/lead";

// --- helpers ---
function safe(s?: string) { return (s ?? "").trim() || undefined; }

function extractXmlSegment(raw: string, root: string) {
  const m = raw.match(new RegExp(`<${root}[\\s\\S]*?<\\/${root}>`, "m"));
  return m ? m[0] : raw; // fallback if caller already passed pure xml
}

function mapPreferredContact(s?: string) {
  const v = (s || "").toLowerCase();
  if (v.includes("email")) return "email";
  if (v.includes("phone") || v.includes("day phone") || v.includes("cell")) return "phone";
  if (v.includes("text")) return "text";
  return safe(s);
}

/** Remove bracketed tags + obvious system meta from STAR "CustomerComments" */
function sanitizeStarComments(s?: string) {
  if (!s) return undefined;
  let t = s;
  // strip bracketed blocks like [Customer Comments] [Vehicle] ...
  t = t.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();

  // drop boilerplate phrases
  const DROP = [
    /ownership and service history not available/i,
    /unknown vehicle/i,
    /number of leads previously submitted/i,
  ];
  for (const r of DROP) t = t.replace(r, "").trim();

  // remove generic "comments:" prefix if present
  t = t.replace(/^comments:\s*/i, "").trim();

  return t.length >= 3 ? t : undefined;
}

/** Parse the plaintext tail after the XML (many STAR emails include a second summary) */
function extractTailFields(raw: string) {
  const out: { preferred?: string; comments?: string } = {};
  const parts = raw.split(/<\/ProcessSalesLead>/i);
  if (parts.length < 2) return out;
  const tail = parts[1];

  // Preferred Contact: Home Email
  const pref = tail.match(/Preferred Contact:\s*(.+)/i)?.[1];
  if (pref) out.preferred = pref.trim();

  // CUSTOMER COMMENT INFORMATION -> Comments: <text>
  const comments = tail.match(/CUSTOMER COMMENT INFORMATION[\s\S]*?Comments:\s*([\s\S]*?)(?:\n{2,}|\r{2,}|$)/i)?.[1];
  if (comments) out.comments = comments.trim();

  return out;
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

  const { narrative, clickPaths, dashboardLinks, qa, preferred, priceFromBlob } =
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
      price: v?.price ?? priceFromBlob,
    },

    // map when those flags exist in your feed
    previousToyotaCustomer: undefined,
    previousLexusCustomer: undefined,

    tradeIn: undefined, // your shown sample had "Do you have a trade in? no"

    qa,
    cdkLeadId: id,
  };
}


// ------------------ STAR normalizer ------------------
export function normalizeLexusSTAR(raw: string): Lead {
  // 1) ensure we’re parsing the actual XML
  const xml = extractXmlSegment(raw, "ProcessSalesLead");
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const doc: any = p.parse(xml);

  const root = doc?.ProcessSalesLead;
  const area = root?.ProcessSalesLeadDataArea;
  const hdr = area?.SalesLead?.SalesLeadHeader;
  const detail = area?.SalesLead?.SalesLeadDetail;
  const vehLine = detail?.SalesLeadLineItem?.SalesLeadVehicleLineItem;
  const veh = vehLine?.SalesLeadVehicle;

  // 2) basic fields
  const given = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.GivenName;
  const family = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.FamilyName;
  const email = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.URICommunication?.URIID;
  const phone = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.TelephoneCommunication?.LocalNumber;
  const preferredXml = hdr?.CustomerProspect?.ProspectParty?.SpecifiedPerson?.ContactMethodTypeCode;

  // 3) comments from XML, sanitized
  const rawXmlComments = hdr?.CustomerComments as string | undefined;
  const xmlNarrative = sanitizeStarComments(rawXmlComments);

  // 4) tail (plaintext) fallback
  const tail = extractTailFields(raw);
  const tailNarrative = sanitizeStarComments(tail.comments);
  const preferredTail = tail.preferred;

  // choose narrative (tail if it looks better than xml meta)
  const narrative = tailNarrative ?? xmlNarrative ?? undefined;

  // 5) vehicle
  const year = veh?.ModelYear ? Number(veh.ModelYear) : undefined;
  const make = veh?.MakeString || veh?.ManufacturerName;
  const model = veh?.Model;
  const trim = veh?.TrimCode;
  const vin = veh?.VehicleID;
  const vehicleHeadline = [year, make, model, trim].filter(Boolean).join(" ");

  // 6) build lead
  return {
    id: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
    createdAt: hdr?.LeadCreationDateTime || hdr?.DocumentDateTime || new Date().toISOString(),
    status: "new",
    customerName: `${safe(given) ?? ""} ${safe(family) ?? ""}`.trim() || "Unknown",

    email: safe(email),
    phone: safe(phone),
    preferredContactMethod: mapPreferredContact(preferredTail ?? preferredXml),

    narrative,                    // clean customer message (if any)
    clickPathUrls: [],            // STAR usually doesn’t include these

    vehicleOfInterest: vehicleHeadline || undefined,
    vehicle: {
      year, make, model, trim, vin,
    },

    // If STAR feed adds these later, wire them here:
    previousToyotaCustomer: undefined,
    previousLexusCustomer: undefined,

    tradeIn: undefined,
    qa: [],                       // STAR rarely includes Q&A; keep empty
    cdkLeadId: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
  };
}
