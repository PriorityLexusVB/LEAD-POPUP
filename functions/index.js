
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { simpleParser } = require('mailparser');
const { normalizeAny } = require('./normalizers/adf');
const { looksLikeChatLead, normalizeChatPlain } = require('./normalizers/chat');
const { classifyLeadSource } = require('./ingest/classify');

admin.initializeApp();
const db = admin.firestore();

const FN_OPTS = {
  region: 'us-central1',
  secrets: ['GMAIL_WEBHOOK_SECRET'],
  memory: '256MiB',
  timeoutSeconds: 120,
};

function base64UrlToUtf8(maybeB64Url) {
  const s = (maybeB64Url || '').trim();
  if (s.startsWith('Delivered-To:') || s.startsWith('Return-Path:') || s.startsWith('From:')) {
    return s;
  }
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf8');
}

exports.receiveEmailLead = functions.runWith(FN_OPTS).https.onRequest(async (req, res) => {
  const { logger } = functions;
  try {
    const providedSecret = req.get('X-Webhook-Secret');
    const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
    if (providedSecret !== expectedSecret) {
      logger.warn('unauthorized webhook attempt');
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const rawBodyStr = (typeof req.body === 'string') ? req.body :
                       (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '');

    if (!rawBodyStr) {
      return res.status(400).json({ ok: false, error: 'missing_body' });
    }

    const rfc822 = base64UrlToUtf8(rawBodyStr);
    const parsed = await simpleParser(rfc822);
    
    const msgId = parsed.messageId || req.get('X-Gmail-Message-Id') || `gen_${Date.now()}`;
    const subject = parsed.subject;
    const from = parsed.from?.text;
    const text = parsed.text;
    const html = parsed.html;
    const receivedAt = parsed.date || new Date();
    const raw = html || text || "";

    let lead = null;
    if (raw.includes("<adf") || raw.includes("<ProcessSalesLead")) {
        lead = normalizeAny(raw);
    } else if (looksLikeChatLead(subject, from, text)) {
        lead = normalizeChatPlain({ msgId, subject, from, text, receivedAt });
    }

    if (!lead) {
      logger.info(`Not a parsable lead. Subject: ${subject}`);
      await db.collection("unparsed_leads").add({ 
        msgId, 
        subject, 
        from, 
        receivedAt: new Date(), 
        snippet: raw.slice(0, 2000) 
      });
      return res.status(202).send("accepted_unparsed");
    }

    const providerName = (/\<provider\>[\s\S]*?\<name[^>]*\>([\s\S]*?)\<\/name\>/.exec(raw)?.[1])?.trim();
    const providerService = (/\<provider\>[\s\S]*?\<service[^>]*\>([\s\S]*?)\<\/service\>/.exec(raw)?.[1])?.trim();
    const providerUrl = (/\<provider\>[\s\S]*?\<url[^>]*\>([\s\S]*?)\<\/url\>/.exec(raw)?.[1])?.trim();
    const starSenderName = (/\<SenderNameCode\>([^<]+)\<\/SenderNameCode\>/.exec(raw)?.[1])?.trim();
    const starCreator = (/\<CreatorNameCode\>([^<]+)\<\/CreatorNameCode\>/.exec(raw)?.[1])?.trim();

    const classified = classifyLeadSource(lead, {
      subject, fromAddr: from, rawText: text,
      providerName, providerService, providerUrl,
      starSenderName, starCreator,
    });
    
    // Ensure `createdAt` is a Firestore-compatible timestamp
    const finalPayload = {
      ...classified,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(classified.createdAt)),
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("leads_v2").doc(classified.id).set(finalPayload, { merge: true });

    logger.info(`Successfully parsed and saved lead: ${classified.id} from ${classified.vendor}`);
    return res.status(200).send("ok");

  } catch (err) {
    logger.error('receiveEmailLead_uncaught', {
      error: err.message,
      stack: err.stack,
      body: req.body
    });
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});
