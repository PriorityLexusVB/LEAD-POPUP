// Firebase Functions v2 + Admin SDK hardened ADF parser
// Parses ADF/XML from attachments, decoded HTML, text, or raw RFC822.
// Validates with Zod, dedupes, archives (optional), and writes to Firestore.

const { onRequest } = require('firebase-functions/v2/onRequest');
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
const DEDUPE_COLL   = process.env.DEDUPE_COLL   || 'email_ingest';
const LEADS_COLL    = process.env.LEADS_COLL    || 'email_leads';
const ARCHIVE_BUCKET= process.env.ARCHIVE_BUCKET|| ''; // optional

// ---- Helpers ----
function base64UrlToUtf8(maybeB64Url) {
  const s = (maybeB64Url || '').trim();
  if (
    s.startsWith('Delivered-To:') || s.startsWith('Return-Path:') ||
    s.startsWith('From:') || s.startsWith('To:') || s.startsWith('Subject:') ||
    s.startsWith('<?xml')
  ) return s; // already decoded raw/rfc822 or xml
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
  // Encode stray ampersands that are not part of known entities
  return xmlString.replace(/&(?!(amp;|lt;|gt;|quot;|apos;))/g, '&amp;');
}

function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function digitsOnly(x) { return (x || '').replace(/\D+/g, ''); }
function normalizePhoneDigits(x) {
  const d = digitsOnly(x);
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  if (d.length === 10) return d;
  return d || null;
}
function phonePretty(d) {
  if (!d || d.length !== 10) return null;
  return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
}
function normalizeZip(x) {
  const m = (x || '').match(/\b\d{5}(-\d{4})?\b/);
  return m ? m[0].slice(0, 10) : null;
}
function toNum(x) {
  if (x == null) return null;
  const n = Number(String(x).replace(/[, ]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseKeyValsFromCdata(text) {
  const out = {};
  const s = (text || '').replace(/\r/g, '');
  const lines = s.split('\n').flatMap(function(line) {
    const parts = [];
    var cursor = 0;
    var regex = /, (?=[A-Z][a-zA-Z ]+:)/g;
    var m;
    while ((m = regex.exec(line))) {
      parts.push(line.slice(cursor, m.index));
      cursor = m.index + 2;
    }
    parts.push(line.slice(cursor));
    return parts;
  });
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    var m = L.match(/\s*([^:]+):\s*(.+)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function parsePreferredContactFromCdata(text) {
  var m = (text || '').match(/Preferred Contact Method:\s*([a-z]+)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function parseOptionalQuestionsFromCdata(text) {
  var arr = [];
  var s = (text || '').replace(/\r/g, '');
  var re = /Question:\s*(.+?)\s+Check:\s*([^\n,]+)(?:,\s*Response:\s*([^\n]+))?/gi;
  var m;
  while ((m = re.exec(s))) {
    arr.push({ question: m[1].trim(), check: (m[2] || '').trim(), response: (m[3] || '').trim() || null });
  }
  return arr;
}

function parseCampaignBitsFromCdata(text) {
  var kv = parseKeyValsFromCdata(text);
  function pick(name) {
    var key = Object.keys(kv).find(function(k){ return k.toLowerCase() === name.toLowerCase(); });
    return key ? kv[key] : null;
  }
  var clickPathUrl = pick('Click Path');
  var utm = {};
  try {
    var url = new URL(clickPathUrl);
    var p = url.searchParams;
    utm.source   = p.get('utm_source')   || null;
    utm.medium   = p.get('utm_medium')   || null;
    utm.campaign = p.get('utm_campaign') || null;
    utm.term     = p.get('utm_term')     || null;
    utm.content  = p.get('utm_content')  || null;
  } catch (_e) {}
  return {
    clickPathUrl: clickPathUrl,
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
    utm: utm
  };
}

async function getAdfXml(parsed, rfc822) {
  // 1) attachments
  if (Array.isArray(parsed.attachments)) {
    for (var i = 0; i < parsed.attachments.length; i++) {
      var a = parsed.attachments[i];
      try {
        var ct = (a.contentType || '').toLowerCase();
        var name = (a.filename || '').toLowerCase();
        if (ct.indexOf('xml') >= 0 || name.endsWith('.xml')) {
          var xml = a.content.toString('utf8');
          var hit = extractAdfXml(xml);
          if (hit) { logger.log('ADF found in attachment:', a.filename || ct); return hit; }
        }
        if (a.content && a.content.length) {
          var maybe = a.content.toString('utf8');
          var hit2 = extractAdfXml(maybe);
          if (hit2) { logger.log('ADF found in attachment (generic):', a.filename || ct); return hit2; }
        }
      } catch (e) { logger.warn('Attachment scan error:', e && e.message); }
    }
  }
  // 2) html-decoded
  if (parsed.html) {
    var decoded = decodeHtmlEntities(parsed.html.toString());
    var hit = extractAdfXml(decoded);
    if (hit) { logger.log('ADF found in decoded HTML'); return hit; }
  }
  // 3) text
  if (parsed.text) {
    var hit3 = extractAdfXml(parsed.text.toString());
    if (hit3) { logger.log('ADF found in text body'); return hit3; }
  }
  // 4) raw fallback
  var hit4 = extractAdfXml(rfc822);
  if (hit4) { logger.log('ADF found in raw RFC822'); return hit4; }
  return null;
}

// ---- ADF normalization ----
function normalizeAdf(adfObj) {
  var adf = adfObj && adfObj.adf ? adfObj.adf : {};
  var p = adf.prospect || {};
  var adfId = (p.id && (p.id['#text'] || p.id)) || null;

  var contact = p.customer && p.customer.contact ? p.customer.contact : {};
  function toArray(v){ return Array.isArray(v) ? v : (v ? [v] : []); }
  var names = toArray(contact.name);
  function findName(part) {
    for (var i=0;i<names.length;i++) {
      var n = names[i];
      if (n && n.part === part) return (n['#text'] || n) || null;
    }
    return null;
  }
  var firstName = findName('first');
  var lastName  = findName('last');
  var email = contact.email || null;

  var phoneRaw = null;
  if (Array.isArray(contact.phone)) {
    phoneRaw = (contact.phone[0] && (contact.phone[0]['#text'] || contact.phone[0])) || null;
  } else if (contact.phone) {
    phoneRaw = contact.phone['#text'] || contact.phone || null;
  }
  var phoneDigits = normalizePhoneDigits(phoneRaw);
  var phonePrettyVal = phonePretty(phoneDigits);
  var zip = normalizeZip(p.customer && p.customer.contact && p.customer.contact.address ? p.customer.contact.address.postalcode : null);

  var vehicles = toArray(p.vehicle);
  var trade = vehicles.find(function(v){ return v && v.interest === 'trade-in'; }) || null;
  var buy   = vehicles.find(function(v){ return v && v.interest === 'buy'; }) || null;

  var cdataText = (p.customer && p.customer.comments) || null;
  var preferred = parsePreferredContactFromCdata(cdataText);
  var optionalQuestions = parseOptionalQuestionsFromCdata(cdataText);
  var campaign = parseCampaignBitsFromCdata(cdataText);

  var tradeIn = trade ? {
    status: trade.status || null,
    year: toNum(trade.year),
    make: trade.make || null,
    model: trade.model || null,
    trim: trade.trim || null,
    odometer: toNum(trade.odometer),
    comments: trade.comments || null
  } : null;

  var interest = buy ? {
    status: buy.status || null,
    year: toNum(buy.year),
    make: buy.make || null,
    model: buy.model || null,
    trim: buy.trim || null,
    vin: buy.vin || null,
    stock: buy.stock || null,
    bodystyle: buy.bodystyle || campaign.bodystyle || null,
    transmission: buy.transmission || campaign.transmission || null,
    price: toNum(buy.price != null ? buy.price : campaign.price),
    odometer: toNum(buy.odometer)
  } : null;

  var validation = {
    hasEmailOrPhone: Boolean(email || phoneDigits),
    emailLooksValid: email ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) : null,
    phoneDigits10: phoneDigits ? phoneDigits.length === 10 : null,
    zipLooksValid: zip ? /^\d{5}(-\d{4})?$/.test(zip) : null
  };

  var customerName = [firstName, lastName].filter(function(x){ return !!x; }).join(' ') || 'Unknown Lead';

  return {
    status: 'new',
    suggestion: '',
    comments: cdataText,
    timestamp: p.requestdate ? new Date(p.requestdate).getTime() : Date.now(),
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    customerName: customerName,
    vehicleName: [interest && interest.year, interest && interest.make, interest && interest.model].filter(function(x){return !!x;}).join(' '),

    meta: {
      adfId: adfId,
      requestDate: p.requestdate || null,
      vendorName: p.vendor && p.vendor.vendorname || null,
      providerName: p.provider && (p.provider.name && (p.provider.name['#text'] || p.provider.name)) || null,
      providerUrl: p.provider && p.provider.url || null
    },
    customer: {
      firstName: firstName,
      lastName: lastName,
      email: email,
      phoneDigits: phoneDigits,
      phonePretty: phonePrettyVal, // presentation layer format
      zip: zip,
      preferredContactMethod: preferred // 'email' | 'phone' | 'text' | null
    },
    tradeIn: tradeIn,
    interest: interest,
    marketing: {
      clickPathUrl: campaign.clickPathUrl,
      primaryCampaignSource: pick('Primary PPC Campaign Source'),
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
    optionalQuestions: optionalQuestions,
    validation: validation
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
  const rfc822 = opts.rfc822;
  const adfXml = opts.adfXml;
  const safeId = (messageId || ('no-msgid-' + Date.now())).replace(/[^\w.-]+/g, '_');
  const date = new Date().toISOString().slice(0,10);
  const rawPath = 'raw/' + date + '/' + safeId + '.eml';
  const adfPath = 'adf/' + date + '/' + safeId + '.xml';
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
exports.receiveEmailLead = onRequest(
  {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET'],
    minInstances: 1,         // keep warm to avoid 503s
    timeoutSeconds: 120,     // large bodies + parsing
    memory: '512MiB'         // mailparser + XML can use RAM
  },
  async (req, res) => {
    // Early breadcrumbs (to debug 500s/cold starts)
    logger.info('receiveEmailLead: started', {
      cl: req.get('content-length') || null,
      ct: req.get('content-type') || null,
      xmid: req.get('X-Gmail-Message-Id') || null
    });

    try {
      const providedSecret = req.get('X-Webhook-Secret');
      const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
      if (providedSecret !== expectedSecret) {
        logger.warn('Unauthorized webhook attempt.');
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }

      const contentLength = Number(req.get('content-length') || '0');
      if (contentLength > MAX_BODY_BYTES) {
        return res.status(413).json({ ok: false, error: 'payload_too_large', bytes: contentLength });
      }

      const rawBodyStr =
        (typeof req.body === 'string') ? req.body :
        (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '');

      if (!rawBodyStr) {
        return res.status(400).json({ ok: false, error: 'missing_body' });
      }

      logger.info('receiveEmailLead: body ready', { len: rawBodyStr.length });

      // Base64url decode (Apps Script sends RAW base64url RFC822)
      const rfc822 = base64UrlToUtf8(rawBodyStr);

      // Mail parsing with guard
      let parsed;
      try {
        parsed = await simpleParser(rfc822);
      } catch (e) {
        logger.error('mailparser_failed', e && e.message);
        return res.status(400).json({ ok:false, error:'mailparser_failed', details: String((e && e.message) || e) });
      }

      const messageId = parsed.messageId || req.get('X-Gmail-Message-Id') || null;

      // Extract ADF everywhere we can
      let adfXml = await getAdfXml(parsed, rfc822);
      if (!adfXml) {
        logger.error('adf_not_found', { attachments: (parsed.attachments || []).length, subject: parsed.subject || null });
        // Archive raw for forensics
        try { await archiveToGcs({ messageId, rfc822 }); } catch (ae) { logger.error('archive_raw_failed', ae && ae.message); }
        return res.status(400).json({ ok:false, error:'adf_not_found' });
      }

      adfXml = sanitizeXml(adfXml);

      // XML parsing with guard
      let adfObj;
      try {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', allowBooleanAttributes: true });
        adfObj = parser.parse(adfXml);
      } catch (e) {
        logger.error('xml_parse_failed', e && e.message);
        try { await archiveToGcs({ messageId, rfc822, adfXml }); } catch (ae) { logger.error('archive_xml_failed', ae && ae.message); }
        return res.status(400).json({ ok:false, error:'xml_parse_failed', details: String((e && e.message) || e) });
      }

      // Normalize + validate
      const leadData = normalizeAdf(adfObj);
      const zres = LeadSchema.safeParse(leadData);
      if (!zres.success) {
        try { await archiveToGcs({ messageId, rfc822, adfXml }); } catch (ae) { logger.error('archive_on_schema_fail', ae && ae.message); }
        await db.collection('email_leads_invalid').add({
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          messageId: messageId,
          subject: parsed.subject || null,
          errors: zres.error.flatten()
        });
        return res.status(422).json({ ok:false, error:'schema_validation_failed', details: zres.error.flatten() });
      }

      // De-dupe
      const mk = await markProcessedIfNew(messageId, leadData.meta.adfId);
      try { await archiveToGcs({ messageId, rfc822, adfXml }); } catch (ae) { logger.error('archive_ok_failed', ae && ae.message); }

      // Persist (only once)
      if (!mk.isDuplicate) {
        const savePayload = {
          // quick top-level fields
          ...leadData,
          // full structured duplication (optional, UI convenience)
          lead: leadData,
          ingest: {
            receivedAt: new Date().toISOString(),
            from: (parsed.from && parsed.from.text) || null,
            to: (parsed.to && parsed.to.text) || null,
            source: 'gmail-webhook-v2'
          }
        };
        await saveLeadDoc(mk.docId, savePayload);
      }

      logger.log('Saved lead', { adfId: leadData.meta.adfId, messageId, duplicate: mk.isDuplicate });
      return res.status(200).json({ ok: true, duplicate: mk.isDuplicate, dedupeKey: mk.docId, messageId });
    } catch (err) {
      logger.error('receiveEmailLead_uncaught', (err && err.message) || String(err), { stack: err && err.stack });
      // Best-effort archive of raw body
      try {
        const rawStr =
          (typeof req.body === 'string') ? req.body :
          (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '');
        const msgId = req.get('X-Gmail-Message-Id') || ('error-' + Date.now());
        await archiveToGcs({ messageId: msgId, rfc822: rawStr });
      } catch (archiveErr) {
        logger.error('archive_on_uncaught_failed', archiveErr && archiveErr.message);
      }
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  }
);

    