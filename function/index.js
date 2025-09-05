
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { parseStringPromise } = require("xml2js");

/** Spark mode & env */
const SPARK_ONLY = process.env.SPARK_ONLY === "1";
const ENV = {
  GMAIL_WEBHOOK_SECRET: (process.env.GMAIL_WEBHOOK_SECRET || "").trim(),
  OPENAI_API_KEY: (process.env.OPENAI_API_KEY || "").trim(),
};

/** Admin init — bind to project */
let _app, _db;
function ensureAdmin() {
  if (!_app) {
    _app = admin.initializeApp();
    _db = admin.firestore(_app);
  }
  return { app: _app, db: _db };
}


/** health */
exports.health = onRequest({ invoker: "public" }, (_req, res) => {
  res.status(200).json({
    ok: true,
    node: process.version,
    at: new Date().toISOString(),
    mode: SPARK_ONLY ? "spark" : "other",
  });
});

/** testSecrets (reads env only) */
exports.testSecrets = onRequest({ invoker: "public" }, (_req, res) => {
  res.json({
    ok: Boolean(ENV.GMAIL_WEBHOOK_SECRET || ENV.OPENAI_API_KEY),
    checks: {
      GMAIL_WEBHOOK_SECRET: Boolean(ENV.GMAIL_WEBHOOK_SECRET),
      OPENAI_API_KEY: Boolean(ENV.OPENAI_API_KEY),
      // harmless extras if you ever add them:
      GMAIL_CLIENT_ID: Boolean(process.env.GMAIL_CLIENT_ID),
      GMAIL_CLIENT_SECRET: Boolean(process.env.GMAIL_CLIENT_SECRET),
      GMAIL_REFRESH_TOKEN: Boolean(process.env.GMAIL_REFRESH_TOKEN),
      GMAIL_REDIRECT_URI: Boolean(process.env.GMAIL_REDIRECT_URI),
    },
    timestamp: new Date().toISOString(),
  });
});

/** firestoreHealth — writes a probe doc in DB */
exports.firestoreHealth = onRequest({ invoker: "public" }, async (_req, res) => {
  try {
    const { db } = ensureAdmin();
    const ref = db.collection("_health").doc("probe");
    await ref.set(
      {
        ping: admin.firestore.FieldValue.serverTimestamp(),
        node: process.version,
        ranAt: new Date().toISOString(),
      },
      { merge: true }
    );
    const snap = await ref.get();
    res.json({ ok: true, exists: snap.exists, data: snap.data() || null });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/** gmailHealth (stub for Spark) */
exports.gmailHealth = onRequest({ invoker: "public" }, async (_req, res) => {
  res.json({ ok: true, note: "gmailHealth is stubbed for Spark mode" });
});


async function parseRawEmail(rawBody) {
  try {
    if (!rawBody || typeof rawBody !== 'string' || rawBody.length === 0) {
        throw new Error('Received empty or invalid request body.');
    }
    
    // The incoming body from Google Apps Script's UrlFetchApp is the raw Base64 string.
    // We must decode it first.
    let decodedBody;
    try {
        decodedBody = Buffer.from(rawBody, 'base64').toString('utf8');
    } catch (e) {
        // This will catch errors if the body is not valid Base64
        throw new Error(`Base64 decoding failed: ${e.message}`);
    }

    // Now that we have the decoded body, find the XML within it.
    const adfStartIndex = decodedBody.toLowerCase().indexOf('<adf>');
    if (adfStartIndex === -1) {
      // Log the decoded body for debugging if XML is not found
      console.error("ADF start tag not found in decoded body:", decodedBody);
      throw new Error('Could not find the start of the <adf> tag in the decoded email.');
    }
    
    const xmlContentWithHeaders = decodedBody.substring(adfStartIndex);
    
    const adfEndIndex = xmlContentWithHeaders.toLowerCase().lastIndexOf('</adf>');
    if (adfEndIndex === -1) {
        throw new Error('Could not find the end of the </adf> tag.');
    }

    // Extract the clean XML content
    const xmlContent = xmlContentWithHeaders.substring(0, adfEndIndex + 6);
    
    const parsed = await parseStringPromise(xmlContent, { explicitArray: false, trim: true, ignoreAttrs: true });
    
    if (!parsed.adf || !parsed.adf.prospect) {
        throw new Error("ADF or prospect tag not found in the parsed XML.");
    }

    const prospect = parsed.adf.prospect;
    const customer = prospect.customer;
    const vehicle = prospect.vehicle;
    
    // Safely access potentially nested or missing properties
    const customerName = (customer && customer.contact && customer.contact.name) || "Name not found";
    const vehicleOfInterest = `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}`.trim() || "Vehicle not specified";
    const comments = prospect.comments || "No comments provided.";
    
    const creationDate = prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now();

    return {
      customerName: customerName,
      vehicle: vehicleOfInterest,
      comments: comments,
      status: 'new',
      timestamp: creationDate,
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook-final-fix-v4', // Updated source for tracking
    };
  } catch (parseError) {
      // Make the error more specific for better debugging
      throw new Error(`Parsing failed: ${parseError.message}`);
  }
}

// receiveEmailLead — auth via header
exports.receiveEmailLead = onRequest(
  {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET'] 
  },
  async (req, res) => {
    let leadData;
    // The rawBody is a Buffer, convert it to a string to get the base64 content.
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    try {
        const provided = req.get('X-Webhook-Secret');
        const expected = process.env.GMAIL_WEBHOOK_SECRET;

        if (provided !== expected) {
            console.warn(`Invalid webhook secret provided.`);
            res.status(401).send('Invalid webhook secret');
            return;
        }

        if (!rawBody) {
            console.error('Request body is missing.');
            res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
            return;
        }
        
        console.log("Received raw body. Attempting to parse...");
        const { db } = ensureAdmin();
        leadData = await parseRawEmail(rawBody);
        console.log("Successfully parsed lead data.");
        
        await db.collection('email_leads').add(leadData);
        console.log('Successfully wrote lead data to Firestore.');
        res.status(200).send('OK');

    } catch (e) {
        console.error(`Lead processing failed critically: ${e.message}`);
        // For debugging, log the body that caused the error
        console.error("--- Start Raw Body That Caused Error ---");
        console.error(rawBody);
        console.error("--- End Raw Body ---");
        
        leadData = {
          customerName: 'Unparsed Lead',
          vehicle: 'Raw Email Data',
          comments: `Parsing failed. Raw content below.\n\nError: ${e.message}\n\n--- Start Raw Body ---\n${rawBody}\n--- End Raw Body ---`,
          status: 'new',
          timestamp: Date.now(),
          suggestion: '',
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'gmail-webhook-error',
          raw: rawBody // Save the raw body for inspection
        };
        
        // Attempt to save the error record to Firestore
        try {
            const { db } = ensureAdmin();
            await db.collection('email_leads').add(leadData);
        } catch (dbError) {
            console.error('CRITICAL: Failed to write ERROR lead to Firestore:', dbError.message, dbError.stack);
        }
        
        res.status(400).json({ ok: false, error: `Bad request: ${e.message}` });
        return;
    }
  }
);


/** listLeads — GET, CORS, read-only for Electron polling */
exports.listLeads = onRequest({ invoker: "public" }, async (req, res) => {
  try {
    // CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();

    const { db } = ensureAdmin();

    const limitParam = Math.max(1, Math.min(100, parseInt(String(req.query.limit || "50"), 10)));
    const sinceParam = String(req.query.since || "").trim();
    const since = sinceParam ? new Date(sinceParam) : null;

    let q = db.collection("email_leads").orderBy("receivedAt", "desc");
    if (since && !isNaN(since.getTime())) {
      q = q.where("receivedAt", ">", since);
    }
    q = q.limit(limitParam);

    const snap = await q.get();
    const items = snap.docs.map((doc) => {
      const d = doc.data();
      const ts =
        typeof d.receivedAt?.toDate === "function"
          ? d.receivedAt.toDate()
          : (d.receivedAt && new Date(d.receivedAt)) || null;
      return {
        id: doc.id,
        receivedAt: ts ? ts.toISOString() : null,
        subject: d.subject || null,
        vehicle: d.vehicle || null,
        customer: d.customer || null,
        source: d.source || null,
      };
    });

    return res.json({ ok: true, items });
  } catch (err) {
    logger.error(err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

/** AI stub */
exports.generateAIReply = onRequest({ invoker: "public" }, async (_req, res) => {
  if (!ENV.OPENAI_API_KEY) {
    return res.status(200).json({ ok: true, stub: true, note: "No OPENAI_API_KEY set; Spark-safe stub." });
  }
  return res.json({ ok: true, note: "OPENAI_API_KEY present. Add outbound call if on Blaze." });
});
