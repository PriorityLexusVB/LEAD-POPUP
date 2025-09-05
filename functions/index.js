
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
 * @param {string} encodedBody The Base64 encoded email body.
 * @return {Promise<object>} A promise that resolves with the parsed lead data.
 */
async function parseRawEmail(encodedBody) {
  if (!encodedBody || typeof encodedBody !== 'string' || encodedBody.length === 0) {
    throw new Error('Received empty or invalid request body.');
  }

  let decodedBody;
  try {
    // Decode the Base64 encoded body to get the actual email content.
    decodedBody = Buffer.from(encodedBody, 'base64').toString('utf8');
  } catch (e) {
    throw new Error(`Base64 decoding failed: ${e.message}`);
  }

  const adfStartIndex = decodedBody.toLowerCase().indexOf('<adf>');
  if (adfStartIndex === -1) {
    // Log the decoded body for debugging if XML is not found.
    console.error("ADF start tag not found in decoded body:", decodedBody);
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
      source: 'gmail-webhook-final-v-correct', // Updated source for tracking
    };
  } catch (parseError) {
    console.error("XML Parsing Error:", parseError);
    console.error("Failed to parse XML content:", xmlContent);
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

    // Get the raw body, which is expected to be a Base64 string.
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    if (!rawBody) {
      logger.error('Request body is missing.');
      res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
      return;
    }

    try {
      logger.log("Received raw body. Attempting to parse...");
      const leadData = await parseRawEmail(rawBody);
      logger.log("Successfully parsed lead data.");
      
      await db.collection('email_leads').add(leadData);
      logger.log('Successfully wrote lead data to Firestore.');
      res.status(200).send('OK');

    } catch (e) {
      logger.error(`Critical lead processing failure: ${e.message}`, {
        errorStack: e.stack,
        rawBodySample: rawBody.substring(0, 200) // Log a sample of the body that caused the error
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
        raw: rawBody 
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
