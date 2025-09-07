
import { HTTP } from "@google-cloud/functions-framework";
import { simpleParser } from "mailparser";
import { XMLParser } from "fast-xml-parser";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";

// ---------- Config ----------
const EXPECTED_SECRET = process.env.WEBHOOK_SECRET || "PriorityLead2025SecretKey";
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const firestore = new Firestore();
const storage = new Storage();

const DEDUPE_COLL = process.env.DEDUPE_COLL || "email_ingest";
const LEADS_COLL  = process.env.LEADS_COLL  || "email_leads";
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || ""; // optional; set to enable archival

// ---------- Helpers (decode / parse) ----------
function base64UrlToUtf8(maybeB64Url) {
  const s = (maybeB64Url || "").trim();
  if (s.startsWith("Delivered-To:") || s.startsWith("Return-Path:") || s.startsWith("From:") ||
      s.startsWith("To:") || s.startsWith("Subject:") || s.startsWith("<?xml")) return s;
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function extractAdfXml(str) {
  const m = str.match(/<\?xml[\s\S]*?<adf[\s\S]*?<\/adf>/i);
  return m ? m[0] : null;
}

// Sanitize non-standard XML entities before parsing.
function sanitizeXml(xmlString) {
    if (!xmlString) return xmlString;
    // Replaces ampersands that are not part of a valid XML entity.
    return xmlString.replace(/&(?!(amp;|lt;|gt;|quot;|apos;))/g, '&amp;');
}

// Minimal HTML entity decoder (enough for common cases)
function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

// Try multiple places: attachments, html (decoded), text, then raw
async function getAdfXml(parsed, rfc822) {
  // 1) Attachments: XML files or attachments that contain <adf ...></adf>
  if (Array.isArray(parsed.attachments)) {
    for (const a of parsed.attachments) {
      try {
        const ct = (a.contentType || "").toLowerCase();
        const name = (a.filename || "").toLowerCase();
        if (ct.includes("xml") || name.endsWith(".xml")) {
          const xml = a.content.toString("utf8");
          const hit = extractAdfXml(xml);
          if (hit) {
            console.log("ADF found in attachment:", a.filename || ct);
            return hit;
          }
        }
        // fallback: scan any text-like attachment
        if (a.content && a.content.length) {
          const maybe = a.content.toString("utf8");
          const hit2 = extractAdfXml(maybe);
          if (hit2) {
            console.log("ADF found in attachment (generic scan):", a.filename || ct);
            return hit2;
          }
        }
      } catch (e) {
        console.warn("Attachment scan error:", e);
      }
    }
  }

  // 2) HTML body may contain HTML-escaped XML
  if (parsed.html) {
    const decoded = decodeHtmlEntities(parsed.html.toString());
    const hit = extractAdfXml(decoded);
    if (hit) {
      console.log("ADF found in decoded HTML body");
      return hit;
    }
  }

  // 3) Text body
  if (parsed.text) {
    const hit = extractAdfXml(parsed.text.toString());
    if (hit) {
      console.log("ADF found in text body");
      return hit;
    }
  }

  // 4) Raw RFC822 as a last resort
  const hit = extractAdfXml(rfc822);
  if (hit) {
    console.log("ADF found in raw RFC822");
    return hit;
  }

  return null;
}


function digitsOnly(x) {
  return (x || "").replace(/\D+/g, "");
}

function normalizePhoneDigits(x) {
  const d = digitsOnly(x);
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return d || null;
}

function phonePretty(d) {
  if (!d || d.length !== 10) return null;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

function normalizeZip(x) {
  const m = (x || "").match(/\b\d{5}(-\d{4})?\b/);
  return m ? m[0].slice(0, 10) : null;
}

function toNum(x) {
  if (x == null) return null;
  const n = Number(String(x).replace(/[, ]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseKeyValsFromCdata(text) {
  const out = {};
  const s = (text || "").replace(/\r/g, "");
  const lines = s.split("\n").flatMap(line => {
    const parts = [];
    let cursor = 0;
    const regex = /, (?=[A-Z][a-zA-Z ]+:)/g;
    let m;
    while ((m = regex.exec(line))) {
      parts.push(line.slice(cursor, m.index));
      cursor = m.index + 2;
    }
    parts.push(line.slice(cursor));
    return parts;
  });
  for (const line of lines) {
    const m = line.match(/\s*([^:]+):\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      out[key] = val;
    }
  }
  return out;
}

function parsePreferredContactFromCdata(text) {
  const m = (text || "").match(/Preferred Contact Method:\s*([a-z]+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function parseOptionalQuestionsFromCdata(text) {
  // Pattern: "Question: ... Check: value[, Response: value]"
  const arr = [];
  const s = (text || "").replace(/\r/g, "");
  const re = /Question:\s*(.+?)\s+Check:\s*([^\n,]+)(?:,\s*Response:\s*([^\n]+))?/gi;
  let m;
  while ((m = re.exec(s))) {
    arr.push({
      question: m[1].trim(),
      check: (m[2] || "").trim(),
      response: (m[3] || "").trim() || null
    });
  }
  return arr;
}

function parseCampaignBitsFromCdata(text) {
  const kv = parseKeyValsFromCdata(text);
  const pick = (name) => {
    const key = Object.keys(kv).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? kv[key] : null;
  };
  const clickPathUrl = pick("Click Path");
  const utm = {};
  try {
    const url = new URL(clickPathUrl);
    const p = url.searchParams;
    utm.source   = p.get("utm_source")   || null;
    utm.medium   = p.get("utm_medium")   || null;
    utm.campaign = p.get("utm_campaign") || null;
    utm.term     = p.get("utm_term")     || null;
    utm.content  = p.get("utm_content")  || null;
  } catch (_) { /* ignore */ }

  return {
    clickPathUrl,
    primaryCampaignSource: pick("Primary PPC Campaign Source"),
    adwordsClickId: pick("Adwords Click Id") || pick("AdWords Click Id") || pick("GCLID") || null,
    networkType: pick("Network Type"),
    eventDatetimeUtc: pick("Datetime") || pick("Date Time") || null,
    country: pick("Country"),
    doors: pick("Doors"),
    bodystyle: pick("Bodystyle"),
    transmission: pick("Transmission"),
    condition: pick("Condition"),
    price: pick("Price"),
    _rawPairs: kv,
    utm
  };
}

// ---------- ADF normalization ----------
function normalizeAdf(adfObj) {
  const p = adfObj?.adf?.prospect || {};
  const adfId = p.id?.["#text"] || p.id || null;

  // Customer/contact
  const contact = p.customer?.contact || {};
  const names = Array.isArray(contact.name) ? contact.name : (contact.name ? [contact.name] : []);
  const firstName = names.find(n => n?.part === "first")?.["#text"] || null;
  const lastName  = names.find(n => n?.part === "last")?.["#text"]  || null;
  const email = contact.email || null;
  const phoneRaw = Array.isArray(contact.phone)
    ? (contact.phone[0]?.["#text"] || contact.phone[0])
    : (contact.phone?.["#text"] || contact.phone || null);
  const phoneDigits = normalizePhoneDigits(phoneRaw);
  const phonePrettyVal = phonePretty(phoneDigits);
  const zip = normalizeZip(contact.address?.postalcode);

  const vehicles = Array.isArray(p.vehicle) ? p.vehicle : (p.vehicle ? [p.vehicle] : []);
  const trade = vehicles.find(v => v?.interest === "trade-in") || null;
  const buy   = vehicles.find(v => v?.interest === "buy") || null;

  const cdataText = p.customer?.comments || null;
  const preferred = parsePreferredContactFromCdata(cdataText);
  const optionalQuestions = parseOptionalQuestionsFromCdata(cdataText);
  const campaign = parseCampaignBitsFromCdata(cdataText);

  const tradeIn = trade ? {
    status: trade.status || null,
    year: toNum(trade.year),
    make: trade.make || null,
    model: trade.model || null,
    trim: trade.trim || null,
    odometer: toNum(trade.odometer),
    comments: trade.comments || null
  } : null;

  const interest = buy ? {
    status: buy.status || null,
    year: toNum(buy.year),
    make: buy.make || null,
    model: buy.model || null,
    trim: buy.trim || null,
    vin: buy.vin || null,
    stock: buy.stock || null,
    bodystyle: buy.bodystyle || campaign.bodystyle || null,
    transmission: buy.transmission || campaign.transmission || null,
    price: toNum(buy.price ?? campaign.price),
    odometer: toNum(buy.odometer)
  } : null;

  const validation = {
    hasEmailOrPhone: Boolean(email || phoneDigits),
    emailLooksValid: email ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) : null,
    phoneDigits10: phoneDigits ? phoneDigits.length === 10 : null,
    zipLooksValid: zip ? /^\d{5}(-\d{4})?$/.test(zip) : null
  };
  
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || 'Unknown Lead';

  return {
    // Top-level fields for easy display
    status: 'new',
    suggestion: '',
    comments: cdataText,
    timestamp: p.requestdate ? new Date(p.requestdate).getTime() : Date.now(),
    receivedAt: Firestore.FieldValue.serverTimestamp(),
    customerName: customerName,
    vehicleName: [interest?.year, interest?.make, interest?.model].filter(Boolean).join(" "),

    // Nested structured data
    meta: {
      adfId,
      requestDate: p.requestdate || null,
      vendorName: p.vendor?.vendorname || null,
      providerName: p.provider?.name?.["#text"] || p.provider?.name || null,
      providerUrl: p.provider?.url || null
    },
    customer: {
      firstName,
      lastName,
      email,
      phoneDigits,
      phonePretty: phonePrettyVal, // ← presentation layer
      zip,
      preferredContactMethod: preferred // 'email' | 'phone' | 'text' | null
    },
    tradeIn,
    interest,
    marketing: {
      clickPathUrl: campaign.clickPathUrl,
      primaryCampaignSource: campaign.primaryCampaignSource,
      adwordsClickId: campaign.adwordsClickId,
      networkType: campaign.networkType,
      eventDatetimeUtc: campaign.eventDatetimeUtc,
      country: campaign.country,
      utm: campaign.utm,
      doors: campaign.doors ? toNum(campaign.doors) : (interest?.doors ?? null),
      bodystyle: campaign.bodystyle || interest?.bodystyle || null,
      transmission: campaign.transmission || interest?.transmission || null,
      condition: campaign.condition || null,
      _allParsedPairs: campaign._rawPairs
    },
    optionalQuestions, // ← structured array [{question, check, response}]
    validation
  };
}

// ---------- Zod schema (strict guard) ----------
const LeadSchema = z.object({
  meta: z.object({
    adfId: z.string().min(1, "adfId required"),
    requestDate: z.string().nullable(),
    vendorName: z.string().nullable(),
    providerName: z.string().nullable(),
    providerUrl: z.string().nullable()
  }),
  customer: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().email().nullable(),
    phoneDigits: z.string().length(10).nullable(),
    phonePretty: z.string().nullable(),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/).nullable(),
    preferredContactMethod: z.enum(["email","phone","text"]).nullable().optional()
  }),
  tradeIn: z.object({
    status: z.string().nullable(),
    year: z.number().int().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    trim: z.string().nullable(),
    odometer: z.number().int().nullable(),
    comments: z.string().nullable()
  }).nullable(),
  interest: z.object({
    status: z.string().nullable(),
    year: z.number().int().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    trim: z.string().nullable(),
    vin: z.string().nullable(),
    stock: z.string().nullable(),
    bodystyle: z.string().nullable(),
    transmission: z.string().nullable(),
    price: z.number().nullable(),
    odometer: z.number().int().nullable()
  }).nullable(),
  marketing: z.object({
    clickPathUrl: z.string().nullable(),
    primaryCampaignSource: z.string().nullable(),
    adwordsClickId: z.string().nullable(),
    networkType: z.string().nullable(),
    eventDatetimeUtc: z.string().nullable(),
    country: z.string().nullable(),
    utm: z.object({
      source: z.string().nullable().optional(),
      medium: z.string().nullable().optional(),
      campaign: z.string().nullable().optional(),
      term: z.string().nullable().optional(),
      content: z.string().nullable().optional()
    }).optional(),
    doors: z.number().int().nullable(),
    bodystyle: z.string().nullable(),
    transmission: z.string().nullable(),
    condition: z.string().nullable(),
    _allParsedPairs: z.record(z.string()).optional()
  }),
  optionalQuestions: z.array(z.object({
    question: z.string(),
    check: z.string().optional(),
    response: z.string().nullable().optional()
  })).optional(),
  validation: z.object({
    hasEmailOrPhone: z.boolean(),
    emailLooksValid: z.boolean().nullable(),
    phoneDigits10: z.boolean().nullable(),
    zipLooksValid: z.boolean().nullable()
  })
});

// ---------- storage / firestore ----------
async function archiveToGcs(opts) {
  if (!ARCHIVE_BUCKET) return;
  const { messageId, rfc822, adfXml } = opts;
  const bucket = storage.bucket(ARCHIVE_BUCKET);
  const safeId = (messageId || `no-msgid-${Date.now()}`).replace(/[^\w.-]+/g, "_");
  const date = new Date().toISOString().slice(0,10);
  const rawPath = `raw/${date}/${safeId}.eml`;
  const adfPath = `adf/${date}/${safeId}.xml`;
  await bucket.file(rawPath).save(Buffer.from(rfc822, "utf8"), { contentType: "message/rfc822" });
  if (adfXml) {
    await bucket.file(adfPath).save(Buffer.from(adfXml, "utf8"), { contentType: "application/xml" });
  }
}

async function markProcessedIfNew(messageId, adfId) {
  const key = `${messageId || "no-msgid"}__${adfId || "no-adfid"}`;
  const ref = firestore.collection(DEDUPE_COLL).doc(key);
const existing = await ref.get();
  if (existing.exists) return { isDuplicate: true, docId: key };
  await ref.set({
    messageId: messageId || null,
    adfId: adfId || null,
    createdAt: Firestore.FieldValue.serverTimestamp()
  });
  return { isDuplicate: false, docId: key };
}

async function saveLeadDoc(docId, payload) {
  const ref = firestore.collection(LEADS_COLL).doc(docId);
  await ref.set(payload, { merge: true });
}

// ---------- Function ----------
HTTP("receiveEmailLead", async (req, res) => {
  try {
    // Secret
    const secret = req.get("X-Webhook-Secret");
    if (secret !== EXPECTED_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    // Size guard
    const contentLength = Number(req.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, error: "payload too large", bytes: contentLength });
    }

    // Body → string
    const rawBodyStr = typeof req.body === "string" ? req.body : (req.rawBody ? req.rawBody.toString("utf8") : "");
    if (!rawBodyStr) throw new Error("Empty body");

    // Decode base64url if needed
    const rfc822 = base64UrlToUtf8(rawBodyStr);

    // Parse email
    const parsed = await simpleParser(rfc822);
    
    // Extract ADF (attachments, html-decoded, text, raw)
    let adfXml = await getAdfXml(parsed, rfc822);
    if (!adfXml) {
      // Log a short diagnostic to help track the shape of the email
      console.error("ADF not found. Has attachments:", Array.isArray(parsed.attachments) ? parsed.attachments.length : 0,
                    "Subject:", parsed.subject);
      throw new Error("ADF XML not found in email");
    }

    // Sanitize and parse
    adfXml = sanitizeXml(adfXml);
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", allowBooleanAttributes: true });
    const adfObj = parser.parse(adfXml);

    // Normalize
    const leadData = normalizeAdf(adfObj);
    
    const messageId = parsed.messageId || req.get("X-Gmail-Message-Id") || null;

    // De-dupe
    const { isDuplicate, docId } = await markProcessedIfNew(messageId, leadData.meta.adfId);

    // Archive (optional)
    await archiveToGcs({ messageId, rfc822, adfXml });

    // Persist (only once)
    if (!isDuplicate) {
        // Zod validation on the nested lead object
        const leadRaw = leadData;
        const zres = LeadSchema.safeParse(leadRaw);
        if (!zres.success) {
          await firestore.collection("email_leads_invalid").add({
            createdAt: Firestore.FieldValue.serverTimestamp(),
            reason: "schema_validation_failed",
            messageId: parsed.messageId || null,
            subject: parsed.subject || null,
            adfXml,
            errors: zres.error.flatten()
          });
          // Archive for forensics even if invalid
          await archiveToGcs({ messageId: parsed.messageId, rfc822, adfXml });
          return res.status(422).json({
            ok: false,
            error: "schema_validation_failed",
            details: zres.error.flatten()
          });
        }
        await saveLeadDoc(docId, leadData);
    }

    // Minor issues (non-blocking)
    const issues = [];
    if (!leadData.validation.hasEmailOrPhone) issues.push("Missing both email and phone");

    return res.status(200).json({
      ok: true,
      duplicate: isDuplicate,
      dedupeKey: docId,
      messageId,
      subject: parsed.subject || null,
      lead: leadData,
      issues: issues.length ? issues : null
    });
  } catch (err) {
    console.error(err);
    // Try to archive on failure
    try {
        const rawBodyStr = typeof req.body === "string" ? req.body : (req.rawBody ? req.rawBody.toString("utf8") : "");
        const messageId = req.get("X-Gmail-Message-Id") || `error-${Date.now()}`;
        await archiveToGcs({ messageId, rfc822: rawBodyStr });
    } catch (archiveErr) {
        console.error("Failed to archive erroring request:", archiveErr);
    }
    return res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

    