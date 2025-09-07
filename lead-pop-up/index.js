
import { HTTP } from "@google-cloud/functions-framework";
import { simpleParser } from "mailparser";
import { XMLParser } from "fast-xml-parser";
import { Firestore } from "@google-cloud/firestore";

// ---------- Config ----------
const EXPECTED_SECRET = process.env.WEBHOOK_SECRET || "PriorityLead2025SecretKey";
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB safety
const firestore = new Firestore();
const DEDUPE_COLL = "email_ingest"; // stores messageId/adfId to avoid duplicates

// ---------- Utils ----------
function base64UrlToUtf8(maybeB64Url) {
  const s = (maybeB64Url || "").trim();
  // If it already looks decoded, return as-is
  if (
    s.startsWith("Delivered-To:") ||
    s.startsWith("Return-Path:") ||
    s.startsWith("From:") ||
    s.startsWith("To:") ||
    s.startsWith("Subject:") ||
    s.startsWith("<?xml")
  ) return s;

  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function extractAdfXml(str) {
  // Handle XML anywhere (raw email body, attachments converted to text, etc.)
  const m = str.match(/<\?xml[\s\S]*?<adf[\s\S]*?<\/adf>/i);
  return m ? m[0] : null;
}

function digitsOnly(x) {
  return (x || "").replace(/\D+/g, "");
}

function normalizePhone(x) {
  const d = digitsOnly(x);
  // NA phone normalization; keep raw if not 10/11
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return d || null;
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
  // Extract "Key: value" pairs from the CDATA blob (multi-lines, commas).
  // Also captures “Key: value, Key2: value2” on a single line.
  const out = {};
  const s = (text || "").replace(/\r/g, "");

  // Split by newline, then also split inline commas cautiously
  const lines = s.split("\n").flatMap(line => {
    // preserve URLs
    const parts = [];
    let cursor = 0;
    const regex = /, (?=[A-Z][a-zA-Z ]+:)/g; // split on ", " before a new Key:
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

function parseCampaignBitsFromCdata(text) {
  const kv = parseKeyValsFromCdata(text);
  // Known keys we care about (case-insensitive map)
  const pick = (name) => {
    const key = Object.keys(kv).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? kv[key] : null;
  };

  return {
    clickPathUrl: pick("Click Path"),
    primaryCampaignSource: pick("Primary PPC Campaign Source"),
    adwordsClickId: pick("Adwords Click Id") || pick("AdWords Click Id") || pick("GCLID") || null,
    networkType: pick("Network Type"),
    eventDatetimeUtc: pick("Datetime") || pick("Date Time") || null,
    country: pick("Country"),
    // Examples in your blob; keep room for future fields:
    doors: pick("Doors"),
    bodystyle: pick("Bodystyle"),
    transmission: pick("Transmission"),
    condition: pick("Condition"),
    price: pick("Price"),
    // raw bag for anything else you may want later
    _rawPairs: kv
  };
}

function normalizeAdf(adfObj) {
  const p = adfObj?.adf?.prospect || {};
  const id = p.id?.["#text"] || p.id || null;
  const requestdate = p.requestdate || null;
  const vendorName = p.vendor?.vendorname || null;
  const providerName = p.provider?.name?.["#text"] || p.provider?.name || null;
  const providerUrl = p.provider?.url || null;

  // Customer
  const contact = p.customer?.contact || {};
  // Handle <name part="..."> array vs single
  const names = Array.isArray(contact.name) ? contact.name : (contact.name ? [contact.name] : []);
  const firstName = names.find(n => n?.part === "first")?.["#text"] || null;
  const lastName  = names.find(n => n?.part === "last")?.["#text"] || null;

  const email = contact.email || null;
  const phoneRaw =
    (Array.isArray(contact.phone) ? contact.phone[0]?.["#text"] || contact.phone[0] : contact.phone?.["#text"] || contact.phone) || null;

  const phone = normalizePhone(phoneRaw);
  const zip = normalizeZip(contact.address?.postalcode);

  // Vehicles
  const vehicles = Array.isArray(p.vehicle) ? p.vehicle : (p.vehicle ? [p.vehicle] : []);
  const trade = vehicles.find(v => v?.interest === "trade-in") || null;
  const buy = vehicles.find(v => v?.interest === "buy") || null;

  // CDATA comments from <customer><comments>
  const cdataText = p.customer?.comments || null;
  const preferredContact = parsePreferredContactFromCdata(cdataText);
  const campaign = parseCampaignBitsFromCdata(cdataText);

  // Normalize vehicles
  const normTrade = trade ? {
    status: trade.status || null,
    year: toNum(trade.year),
    make: trade.make || null,
    model: trade.model || null,
    trim: trade.trim || null,
    odometer: toNum(trade.odometer),
    comments: trade.comments || null
  } : null;

  const normBuy = buy ? {
    status: buy.status || null,
    year: toNum(buy.year),
    make: buy.make || null,
    model: buy.model || null,
    trim: buy.trim || null,
    vin: buy.vin || null,
    stock: buy.stock || null,
    bodystyle: buy.bodystyle || null,
    transmission: buy.transmission || null,
    price: toNum(buy.price),
    odometer: toNum(buy.odometer)
  } : null;

  // Derived / validation flags
  const hasReachableContact = Boolean(email || phone);
  const validation = {
    hasEmailOrPhone: hasReachableContact,
    emailLooksValid: email ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) : null,
    phoneDigits10: phone ? phone.length === 10 : null,
    zipLooksValid: zip ? /^\d{5}(-\d{4})?$/.test(zip) : null
  };
  
  const customerName = [firstName, lastName].filter(Boolean).join(" ") || 'Unknown Lead';

  return {
    // Top-level fields for easy display
    status: 'new',
    suggestion: '',
    comments: cdataText,
    timestamp: requestdate ? new Date(requestdate).getTime() : Date.now(),
    receivedAt: Firestore.FieldValue.serverTimestamp(),
    customerName: customerName,
    vehicleName: [normBuy?.year, normBuy?.make, normBuy?.model].filter(Boolean).join(" "),

    // Nested structured data
    meta: {
      adfId: id,
      requestDate: requestdate,
      vendorName,
      providerName,
      providerUrl
    },
    customer: {
      firstName,
      lastName,
      email,
      phone,
      zip,
      preferredContactMethod: preferredContact // ← requested
    },
    tradeIn: normTrade,
    interest: normBuy,
    marketing: {
      clickPathUrl: campaign.clickPathUrl,
      primaryCampaignSource: campaign.primaryCampaignSource,
      adwordsClickId: campaign.adwordsClickId,
      networkType: campaign.networkType,
      eventDatetimeUtc: campaign.eventDatetimeUtc,
      country: campaign.country,
      // echo a few common vehicle attributes if CDATA overrides exist:
      doors: campaign.doors ? toNum(campaign.doors) : (normBuy?.doors ?? null),
      bodystyle: campaign.bodystyle || normBuy?.bodystyle || null,
      transmission: campaign.transmission || normBuy?.transmission || null,
      condition: campaign.condition || null,
      priceFromCdata: campaign.price ? toNum(campaign.price) : null,
      _allParsedPairs: campaign._rawPairs
    },
    validation
  };
}

async function markProcessedIfNew(messageId, adfId) {
  const key = `${messageId || "no-msgid"}__${adfId || "no-adfid"}`;
  const ref = firestore.collection(DEDUPE_COLL).doc(key);
  const existing = await ref.get();
  if (existing.exists) {
    return { isDuplicate: true, docId: key };
  }
  await ref.set({
    messageId: messageId || null,
    adfId: adfId || null,
    createdAt: Firestore.FieldValue.serverTimestamp()
  });
  return { isDuplicate: false, docId: key };
}

// ---------- Main Handler ----------
async function processLead(req, res) {
    // 0) Secret
    const secret = req.get("X-Webhook-Secret");
    if (secret !== EXPECTED_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    // 1) Safety: content length
    const contentLength = Number(req.get("content-length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, error: "payload too large", bytes: contentLength });
    }
    
    // 2) Get body as string
    const rawBodyStr = typeof req.body === "string" ? req.body : (req.rawBody ? req.rawBody.toString("utf8") : "");
    if (!rawBodyStr) throw new Error("Empty body");

    // 3) Convert base64url → utf8 if needed
    const rfc822 = base64UrlToUtf8(rawBodyStr);

    // 4) Parse email
    const parsedEmail = await simpleParser(rfc822);
    const emailText = (parsedEmail.text || parsedEmail.html || rfc822 || "").toString();

    // 5) Extract ADF
    const adfXml = extractAdfXml(emailText) || extractAdfXml(rfc822);
    if (!adfXml) throw new Error("ADF XML not found in email");

    // 6) XML → JSON
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", allowBooleanAttributes: true });
    const adfObj = parser.parse(adfXml);

    // 7) Normalize
    const leadData = normalizeAdf(adfObj);

    // 8) Idempotency / de-dupe
    const messageId = parsedEmail.messageId || null;
    const { isDuplicate, docId } = await markProcessedIfNew(messageId, leadData.meta.adfId);

    if (isDuplicate) {
        return res.status(200).json({ ok: true, duplicate: true, dedupeKey: docId, messageId });
    }
    
    // 9) Save to Firestore
    await firestore.collection("email_leads").add(leadData);

    // 10) Respond
    return res.status(201).json({
      ok: true,
      duplicate: false,
      dedupeKey: docId,
      messageId,
      subject: parsedEmail.subject || null,
      leadId: leadData.meta.adfId
    });
}


// ---------- Entrypoint ----------
HTTP("receiveEmailLead", async (req, res) => {
  try {
    await processLead(req, res);
  } catch (err) {
    console.error(err);
    return res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});
