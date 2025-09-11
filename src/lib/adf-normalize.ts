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
};

function extractDealerEProcessCdata(cdata: string): Extracted {
  const lines = (cdata || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const clickPaths: string[] = [];
  const dashboardLinks: string[] = [];
  const qa: { question: string; answer: string }[] = [];
  const narrative: string[] = [];
  let preferred: string | undefined;

  // Known junk to drop from narrative
  const DROP_LINE = /^(primary ppc campaign|secondary ppc campaign|source:|click id:|expires:|network type:|lexus dealercode|vehicle prices|lexus sourceid|datetime:|sara details:|everest dr details:|country:|bodystyle:|transmission:|condition:|price:)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // URLs
    if (lower.startsWith("click path:")) {
      const urls = line.match(/https?:\/\/\S+/g) || [];
      clickPaths.push(...urls);
      continue;
    }
    if (lower.startsWith("return shopper")) {
      const urls = line.match(/https?:\/\/\S+/g) || [];
      dashboardLinks.push(...urls);
      continue;
    }

    // Preferred contact (e.g., "Preferred Contact Method: email" or "Prefer text")
    if (lower.startsWith("preferred contact method:")) {
      preferred = line.split(":")[1]?.trim();
      continue;
    }
    if (lower === "prefer text") {
      preferred = "text";
      // keep the hint also in narrative for reps to see
      narrative.push("Prefer text");
      continue;
    }

    // Optional questions block
    if (/^optional questions/i.test(line)) continue;
    if (/^question:/i.test(line)) {
      const q = line.replace(/^question:\s*/i, "").trim();
      let a = "—";
      // consume following lines until next question or end
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

    // Drop PPC/dealer boilerplate
    if (DROP_LINE.test(lower)) continue;

    // Keep anything else as free-form narrative
    narrative.push(line);
  }

  // dedupe & return
  const uniq = (arr: string[]) => Array.from(new Set(arr));
  return {
    narrative: (narrative.join("\n").trim() || undefined),
    clickPaths: uniq(clickPaths),
    dashboardLinks: uniq(dashboardLinks),
    qa,
    preferred,
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

  const customerComments = safeTrim(hdr?.CustomerComments); // STAR often stores meta here (we'll keep it minimal)

  const vehicleHeadline = [v?.ModelYear, v?.MakeString || v?.ManufacturerName, v?.Model].filter(Boolean).join(" ");

  return {
    id: String(hdr?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? ""),
    createdAt: hdr?.LeadCreationDateTime ?? Date.now(),
    status: "new",
    customerName: fullName(given, family),

    email: safeTrim(email),
    phone: safeTrim(phone),

    // Keep only human-useful comments; STAR rarely includes PPC junk here
    narrative: customerComments,

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
