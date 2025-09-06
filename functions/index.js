
const { onRequest } = require('firebase-functions/v2/onRequest');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { parseStringPromise } = require('xml2js');

// Initialize Firebase Admin SDK.
admin.initializeApp();

// Get a reference to the default Firestore database.
const db = admin.firestore();

/**
 * Parses the raw email body to extract lead data.
 * @param {string} rawBody The raw request body, expected to be Base64 encoded.
 * @return {Promise<object>} A promise that resolves with the parsed lead data.
 */
async function parseRawEmail(rawBody) {
  if (!rawBody || typeof rawBody !== 'string' || rawBody.length === 0) {
    throw new Error('Received empty or invalid request body.');
  }

  // The request body from Google Apps Script is a Base64 string.
  // We must first decode it to get the actual email content.
  const decodedBody = Buffer.from(rawBody, 'base64').toString('utf8');

  const adfStartIndex = decodedBody.toLowerCase().indexOf('<adf>');
  if (adfStartIndex === -1) {
    logger.error("ADF start tag not found in decoded body:", { body: decodedBody });
    throw new Error('Could not find the start of the <adf> tag in the decoded email.');
  }

  const xmlContentWithHeaders = decodedBody.substring(adfStartIndex);
  const adfEndIndex = xmlContentWithHeaders.toLowerCase().lastIndexOf('</adf>');
  if (adfEndIndex === -1) {
    throw new Error('Could not find the end of the </adf> tag.');
  }

  const xmlContent = xmlContentWithHeaders.substring(0, adfEndIndex + 6);

  try {
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: false,
      trim: true,
      ignoreAttrs: true
    });

    if (!parsed.adf || !parsed.adf.prospect) {
      throw new Error("ADF or prospect tag not found in the parsed XML.");
    }

    const prospect = parsed.adf.prospect;
    const customer = prospect.customer || {};
    const vehicle = prospect.vehicle || {};
    const contact = customer.contact || {};

    const customerName = contact.name || "Name not found";
    const vehicleOfInterest = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || "Vehicle not specified";
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
      source: 'gmail-webhook-correct-final-v4', // Updated source for tracking
    };
  } catch (parseError) {
    logger.error("XML Parsing Error:", { error: parseError, xml: xmlContent });
    throw new Error(`XML parsing failed: ${parseError.message}`);
  }
}

/**
 * Receives email lead data from a webhook, parses it, and saves it to Firestore.
 */
exports.receiveEmailLead = onRequest(
  {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET']
  },
  async (req, res) => {
    // Authenticate the request.
    const providedSecret = req.get('X-Webhook-Secret');
    const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;

    if (providedSecret !== expectedSecret) {
      logger.warn("Unauthorized webhook attempt.");
      res.status(401).send('Invalid webhook secret');
      return;
    }
    
    // The rawBody is a Buffer, convert it to a string to get the base64 content.
    const rawBodyAsString = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    if (!rawBodyAsString) {
      logger.error('Request body is missing.');
      res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
      return;
    }

    try {
      logger.log("Received raw body. Attempting to parse...");
      const leadData = await parseRawEmail(rawBodyAsString);
      logger.log("Successfully parsed lead data.");
      
      await db.collection('email_leads').add(leadData);
      logger.log('Successfully wrote lead data to Firestore.');
      res.status(200).send('OK');

    } catch (e) {
      logger.error(`Critical lead processing failure: ${e.message}`, {
        errorStack: e.stack,
        rawBodySample: rawBodyAsString.substring(0, 200) // Log a sample of the body
      });
      
      // Save the error record to Firestore for debugging.
      const errorData = {
        customerName: 'Unparsed Lead',
        vehicle: 'Raw Email Data',
        comments: `Parsing failed. Error: ${e.message}`,
        status: 'new',
        timestamp: Date.now(),
        suggestion: '',
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'gmail-webhook-error',
        raw: rawBodyAsString 
      };
      
      try {
        await db.collection('email_leads').add(errorData);
      } catch (dbError) {
        logger.error('CRITICAL: Failed to write ERROR lead to Firestore:', dbError.message, { stack: dbError.stack });
      }
      
      res.status(400).json({ ok: false, error: `Bad request: ${e.message}` });
    }
  }
);
