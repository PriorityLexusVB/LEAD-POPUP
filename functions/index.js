// Firebase Functions v2 + Admin SDK hardened ADF parser
// Parses ADF/XML from attachments, decoded HTML, text, or raw RFC822.
// Validates with Zod, dedupes, archives (optional), and writes to Firestore.

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { simpleParser } = require('mailparser');
const { XMLParser } = require('fast-xml-parser');
const { z } = require('zod');

// ---- Init ----
admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// ---- Config ----
const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const DEDUPE_COLL    = process.env.DEDUPE_COLL    || 'email_ingest';
const LEADS_COLL     = process.env.LEADS_COLL     || 'email_leads';
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || ''; // optional GCS bucket name

// ---- Helpers (robust string/number/zip/phone) ----
function toStr(x) {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  if (typeof x === 'object') {
    if (typeof x['#text'] === 'string') return x['#text'];
    if (Array.isArray(x)) return x.map(toStr).join(' ');
    try { return String(x); } catch (_e) { return ''; }
  }
  return '';
}

function digitsOnly(x) {
  return toStr(x).replace(/\D+/g, '');
}

function normalizePhoneDigits(x) {
  const d = digitsOnly(x);
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  if (d.length === 10) return d;
  return d || null;
}

function phonePretty(d) {
  if (!d || d.length !== 10) return null;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

function normalizeZip(x) {
  const s = toStr(x);
  const m = s.match(/\b\d{5}(?:-\d{4})?\b/);
  return m ? m[0] : null;
}

function toNum(x) {
  const s = toStr(x);
  if (!s) return null;
  const n = Number(s.replace(/[, ]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ---- ADF/XML helpers ----
function base64UrlToUtf8(maybeB64Url) {
  const s = toStr(maybeB64Url).trim();
  if (
    s.startsWith('Delivered-To:') || s.startsWith('Return-Path:') ||
    s.startsWith('From:') || s.startsWith('To:') || s.startsWith('Subject:') ||
    s.startsWith('<?xml')
  ) return s; // already raw/rfc822 or xml
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function extractAdfXml(str) {
  if (!str) return null;
  const m = String(str).match(/<\?xml[\s\S]*?<adf[\s\S]*?<\/adf>/i);
  return m ? m[0] : null;
}

function sanitizeXml(xmlString) {
  if (!xmlString) return xmlString;
  // encode stray ampersands that aren't an entity
  return xmlString.replace(/&(?!(amp;|lt;|gt;|quot;|apos;))/g, '&amp;');
}

function decodeHtmlEntities(s) {
  return toStr(s)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function parseKeyValsFromCdata(text) {
  const out = {};
  const s = toStr(text).replace(/\r/g, '');
  const lines = s.split('\n').flatMap(function (line) {
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
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const m = L.match(/\s*([^:]+):\s*(.+)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function parsePreferredContactFromCdata(text) {
  const m = toStr(text).match(/Preferred Contact Method:\s*([a-z]+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function parseOptionalQuestionsFromCdata(text) {
  const arr = [];
  const s = toStr(text).replace(/\r/g, '');
  const re = /Question:\s*(.+?)\s+Check:\s*([^\n,]+)(?:,\s*Response:\s*([^\n]+))?/gi;
  let m;
  while ((m = re.exec(s))) {
    arr.push({
      question: m[1].trim(),
      check: (m[2] || '').trim(),
      response: (m[3] || '').trim() || null
    });
  }
  return arr;
}

function parseCampaignBitsFromCdata(text) {
  const kv = parseKeyValsFromCdata(text);
  function pick(name) {
    const key = Object.keys(kv).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? kv[key] : null;
  }
  const clickPathUrl = pick('Click Path');
  const utm = {};
  try {
    const url = new URL(clickPathUrl);
    const p = url.searchParams;
    utm.source   = p.get('utm_source')   || null;
    utm.medium   = p.get('utm_medium')   || null;
    utm.campaign = p.get('utm_campaign') || null;
    utm.term     = p.get('utm_term')     || null;
    utm.content  = p.get('utm_content')  || null;
  } catch (_e) {}
  return {
    clickPathUrl,
    primaryCampaignSource: pick('Primary PPC Campaign Source'),
    adwordsClickId: pick('Adwords Click Id') || pick('AdWords Click Id') || pick('GCLID') || null,
    networkType: pick('Network Type'),
    eventDatetimeUtc: pick('Datetime') || pick('Date Time') || null,
    country: pick('Country'),
    doors: pick('Doors'),
    bodystyle: pick('Bodystyle'),
    transmission: pick('Transmission'),
    condition: pick('Condition'),
    price: pick('Price'),
    _rawPairs: kv,
    utm
  };
}

async function getAdfXml(parsed, rfc822) {
  // 1) attachments
  if (Array.isArray(parsed.attachments)) {
    for (let i = 0; i < parsed.attachments.length; i++) {
      const a = parsed.attachments[i];
      try {
        const ct = toStr(a.contentType).toLowerCase();
        const name = toStr(a.filename).toLowerCase();
        if (ct.includes('xml') || name.endsWith('.xml')) {
          const xml = a.content.toString('utf8');
          const hit = extractAdfXml(xml);
          if (hit) { logger.info('ADF found in attachment: ' + (a.filename || ct)); return hit; }
        }
        if (a.content && a.content.length) {
          const maybe = a.content.toString('utf8');
          const hit2 = extractAdfXml(maybe);
          if (hit2) { logger.info('ADF found in attachment (generic): ' + (a.filename || ct)); return hit2; }
        }
      } catch (e) {
        logger.warn('Attachment scan error: ' + toStr(e && e.message));
      }
    }
  }
  // 2) html-decoded
  if (parsed.html) {
    const decoded = decodeHtmlEntities(parsed.html.toString());
    const hit = extractAdfXml(decoded);
    if (hit) { logger.info('ADF found in decoded HTML'); return hit; }
  }
  // 3) text
  if (parsed.text) {
    const hit3 = extractAdfXml(parsed.text.toString());
    if (hit3) { logger.info('ADF found in text body'); return hit3; }
  }
  // 4) raw fallback
  const hit4 = extractAdfXml(rfc822);
  if (hit4) { logger.info('ADF found in raw RFC822'); return hit4; }
  return null;
}

// ---- ADF normalization ----
function normalizeAdf(adfObj) {
  const adf = adfObj && adfObj.adf ? adfObj.adf : {};
  const p = adf.prospect || {};
  const adfId = (p.id && (p.id['#text'] || p.id)) || null;

  const contact = p.customer && p.customer.contact ? p.customer.contact : {};
  const toArray = v => Array.isArray(v) ? v : (v ? [v] : []);
  const names = toArray(contact.name);

  function findName(part) {
    for (let i = 0; i < names.length; i++) {
      const n = names[i];
      if (n && n.part === part) return (n['#text'] || n) || null;
    }
    return null;
  }

  const firstName = toStr(findName('first')) || null;
  const lastName  = toStr(findName('last'))  || null;
  const email     = contact.email ? (toStr(contact.email) || null) : null;

  // phone
  let phoneRaw = null;
  if (Array.isArray(contact.phone)) {
    for (let i = 0; i < contact.phone.length; i++) {
      const pv = toStr(contact.phone[i]);
      if (pv) { phoneRaw = pv; break; }
    }
  } else if (contact.phone) {
    phoneRaw = toStr(contact.phone);
  }
  const phoneDigits = normalizePhoneDigits(phoneRaw);
  const phonePrettyVal = phonePretty(phoneDigits);

  // zip/postal
  const address = (p.customer && p.customer.contact && p.customer.contact.address) || {};
  const postalCandidate =
    (address && ('postalcode' in address ? address.postalcode :
    ('zip' in address ? address.zip :
    ('postal' in address ? address.postal :
    ('postCode' in address ? address.postCode : null))))) || null;
  const zip = normalizeZip(postalCandidate);

  const vehicles = toArray(p.vehicle);
  const trade = vehicles.find(v => v && v.interest === 'trade-in') || null;
  const buy   = vehicles.find(v => v && v.interest === 'buy')      || null;

  const cdataText = (p.customer && p.customer.comments) || null;
  const preferred = parsePreferredContactFromCdata(cdataText);
  const optionalQuestions = parseOptionalQuestionsFromCdata(cdataText);
  const campaign = parseCampaignBitsFromCdata(cdataText);

  const tradeIn = trade ? {
    status: toStr(trade.status) || null,
    year: toNum(trade.year),
    make: toStr(trade.make) || null,
    model: toStr(trade.model) || null,
    trim: toStr(trade.trim) || null,
    odometer: toNum(trade.odometer),
    comments: toStr(trade.comments) || null
  } : null;

  const interest = buy ? {
    status: toStr(buy.status) || null,
    year: toNum(buy.year),
    make: toStr(buy.make) || null,
    model: toStr(buy.model) || null,
    trim: toStr(buy.trim) || null,
    vin: toStr(buy.vin) || null,
    stock: toStr(buy.stock) || null,
    bodystyle: toStr(buy.bodystyle) || toStr(campaign.bodystyle) || null,
    transmission: toStr(buy.transmission) || toStr(campaign.transmission) || null,
    price: toNum(buy.price != null ? buy.price : campaign.price),
    odometer: toNum(buy.odometer)
  } : null;

  const validation = {
    hasEmailOrPhone: Boolean(email || phoneDigits),
    emailLooksValid: email ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) : null,
    phoneDigits10: phoneDigits ? phoneDigits.length === 10 : null,
    zipLooksValid: zip ? /^\d{5}(-\d{4})?$/.test(zip) : null
  };

  const customerName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Lead';

  return {
    status: 'new',
    suggestion: '',
    comments: toStr(cdataText) || null,
    timestamp: p.requestdate ? new Date(p.requestdate).getTime() : Date.now(),
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    customerName,
    vehicleName: [interest && interest.year, interest && interest.make, interest && interest.model].filter(Boolean).join(' '),

    meta: {
      adfId: adfId,
      requestDate: p.requestdate || null,
      vendorName: p.vendor && p.vendor.vendorname || null,
      providerName: p.provider && (p.provider.name && (p.provider.name['#text'] || p.provider.name)) || null,
      providerUrl: p.provider && p.provider.url || null
    },
    customer: {
      firstName,
      lastName,
      email,
      phoneDigits,
      phonePretty: phonePrettyVal,
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
      doors: campaign.doors ? toNum(campaign.doors) : null,
      bodystyle: campaign.bodystyle || (interest && interest.bodystyle) || null,
      transmission: campaign.transmission || (interest && interest.transmission) || null,
      condition: campaign.condition || null,
      _allParsedPairs: campaign._rawPairs
    },
    optionalQuestions,
    validation
  };
}

// ---- Zod guard ----
const LeadSchema = z.object({
  meta: z.object({
    adfId: z.string().min(1),
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
    preferredContactMethod: z.enum(['email','phone','text']).nullable().optional()
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

// ---- storage / firestore ----
async function archiveToGcs(opts) {
  if (!ARCHIVE_BUCKET) return;
  const bucket = storage.bucket(ARCHIVE_BUCKET);
  const messageId = opts.messageId;
  const rfc822 = toStr(opts.rfc822);
  const adfXml = toStr(opts.adfXml);
  const safeId = (messageId || (`no-msgid-${Date.now()}`)).replace(/[^\w.-]+/g, '_');
  const date = new Date().toISOString().slice(0,10);
  const rawPath = `raw/${date}/${safeId}.eml`;
  const adfPath = `adf/${date}/${safeId}.xml`;
  await bucket.file(rawPath).save(Buffer.from(rfc822, 'utf8'), { contentType: 'message/rfc822' });
  if (adfXml) {
    await bucket.file(adfPath).save(Buffer.from(adfXml, 'utf8'), { contentType: 'application/xml' });
  }
}

async function markProcessedIfNew(messageId, adfId) {
  const key = (messageId || 'no-msgid') + '__' + (adfId || 'no-adfid');
  const ref = db.collection(DEDUPE_COLL).doc(key);
  const existing = await ref.get();
  if (existing.exists) return { isDuplicate: true, docId: key };
  await ref.set({
    messageId: messageId || null,
    adfId: adfId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { isDuplicate: false, docId: key };
}

async function saveLeadDoc(docId, payload) {
  const ref = db.collection(LEADS_COLL).doc(docId);
  await ref.set(payload, { merge: true });
}

// ---- Function (Firebase v2) ----
exports.receiveEmailLeadV2 = onRequest(
  {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET'], // set via: firebase functions:secrets:set GMAIL_WEBHOOK_SECRET
    // minInstances: 0 by default (no monthly floor)
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async (req, res) => {
    // Breadcrumbs
    logger.info('receiveEmailLead: started cl=' + toStr(req.get('content-length')) + ' ct=' + toStr(req.get('content-type')) + ' xmid=' + toStr(req.get('X-Gmail-Message-Id')));

    try {
      // Auth
      const providedSecret = req.get('X-Webhook-Secret');
      const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
      if (providedSecret !== expectedSecret) {
        logger.warn('unauthorized webhook attempt');
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }

      // Size guard
      const contentLength = Number(req.get('content-length') || '0');
      if (contentLength > MAX_BODY_BYTES) {
        return res.status(413).json({ ok: false, error: 'payload_too_large', bytes: contentLength });
      }

      // Read body
      const rawBodyStr =
        (typeof req.body === 'string') ? req.body :
        (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '');

      if (!rawBodyStr) {
        return res.status(400).json({ ok: false, error: 'missing_body' });
      }

      logger.info('receiveEmailLead: body ready len=' + rawBodyStr.length);

      // decode base64url RFC822 (Apps Script sends RAW)
      const rfc822 = base64UrlToUtf8(rawBodyStr);

      // Parse email
      let parsed;
      try {
        parsed = await simpleParser(rfc822);
      } catch (e) {
        logger.error('mailparser_failed: ' + toStr(e && e.message));
        return res.status(400).json({ ok:false, error:'mailparser_failed', details: toStr(e && e.message) });
      }

      const messageId = toStr(parsed.messageId) || toStr(req.get('X-Gmail-Message-Id')) || null;

      // Extract ADF
      let adfXml = await getAdfXml(parsed, rfc822);
      if (!adfXml) {
        logger.warn('adf_not_found: msgId=' + toStr(messageId) + ' subject=' + toStr(parsed.subject) + ' from=' + toStr(parsed.from && parsed.from.text));
        try { await archiveToGcs({ messageId, rfc822 }); } catch (ae) { logger.error('archive_raw_failed_on_non_lead: ' + toStr(ae && ae.message)); }
        return res.status(200).json({ ok:true, outcome:'not_a_lead_email' });
      }

      adfXml = sanitizeXml(adfXml);

      // XML parse
      let adfObj;
      try {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', allowBooleanAttributes: true });
        adfObj = parser.parse(adfXml);
      } catch (e) {
        logger.error('xml_parse_failed: ' + toStr(e && e.message));
        try { await archiveToGcs({ messageId, rfc822, adfXml }); } catch (ae) { logger.error('archive_xml_failed: ' + toStr(ae && ae.message)); }
        return res.status(400).json({ ok:false, error:'xml_parse_failed', details: toStr(e && e.message) });
      }

      // Normalize + validate
      const leadData = normalizeAdf(adfObj);
      const zres = LeadSchema.safeParse(leadData);
      if (!zres.success) {
        try { await archiveToGcs({ messageId, rfc822, adfXml }); } catch (ae) { logger.error('archive_on_schema_fail: ' + toStr(ae && ae.message)); }
        await db.collection('email_leads_invalid').add({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          messageId: messageId,
          subject: toStr(parsed.subject) || null,
          errors: zres.error.flatten()
        });
        return res.status(422).json({ ok:false, error:'schema_validation_failed', details: zres.error.flatten() });
      }

      // De-dupe key + archive
      const mk = await markProcessedIfNew(messageId, leadData.meta.adfId);
      try { await archiveToGcs({ messageId, rfc822, adfXml }); } catch (ae) { logger.error('archive_ok_failed: ' + toStr(ae && ae.message)); }

      // Persist (only once)
      if (!mk.isDuplicate) {
        const savePayload = {
          ...leadData,
          lead: leadData,
          ingest: {
            receivedAt: new Date().toISOString(),
            from: toStr(parsed.from && parsed.from.text) || null,
            to: toStr(parsed.to && parsed.to.text) || null,
            source: 'gmail-webhook-v2'
          }
        };
        await saveLeadDoc(mk.docId, savePayload);
      }

      logger.info('Saved lead adfId=' + toStr(leadData.meta.adfId) + ' messageId=' + toStr(messageId) + ' duplicate=' + String(mk.isDuplicate));
      return res.status(200).json({ ok: true, duplicate: mk.isDuplicate, dedupeKey: mk.docId, messageId });
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : String(err);
      const stack = (err && err.stack) ? String(err.stack) : '';
      logger.error('receiveEmailLead_uncaught: ' + msg + ' stack=' + stack);
      try {
        const rawStr =
          (typeof req.body === 'string') ? req.body :
          (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '');
        const msgId = req.get('X-Gmail-Message-Id') || ('error-' + Date.now());
        await archiveToGcs({ messageId: msgId, rfc822: rawStr });
      } catch (archiveErr) {
        logger.error('archive_on_uncaught_failed: ' + String((archiveErr && archiveErr.message) || archiveErr));
      }
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }
);
