
const { onRequest } = require('firebase-functions/v2/onRequest');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { parseStringPromise } = require('xml2js');

// Initialize Firebase Admin SDK.
admin.initializeApp();

// Get a reference to the default Firestore database.
const db = admin.firestore();

/**
 * Extracts the ADF XML content from a raw email body.
 * @param {string} rawEmailContent The full raw content of the email.
 * @return {string | null} The extracted XML string or null if not found.
 */
function extractXml(rawEmailContent) {
  // The ADF/XML data is often embedded within the email body.
  // We need to find the start of the XML declaration.
  const xmlStartIndex = rawEmailContent.indexOf('<?xml');
  if (xmlStartIndex === -1) {
    logger.error('Could not find the start of the XML tag in the email content.');
    return null;
  }

  // Slice the string to get from the start of the XML tag to the end.
  const xmlContentWithPotentiallyTrailingData = rawEmailContent.substring(xmlStartIndex);

  // Find the closing ADF tag to ensure we only parse valid XML.
  const adfEndIndex = xmlContentWithPotentiallyTrailingData.toLowerCase().lastIndexOf('</adf>');
  if (adfEndIndex === -1) {
    logger.error('Could not find the end of the </adf> tag.');
    return null;
  }

  // Extract the clean XML content. The "+6" accounts for the length of "</adf>".
  const cleanXml = xmlContentWithPotentiallyTrailingData.substring(0, adfEndIndex + 6);
  return cleanXml;
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
    
    // The rawBody is a Buffer containing the Base64 string from Apps Script.
    // First, convert the buffer to a UTF-8 string to get the Base64 content.
    const base64Content = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    if (!base64Content) {
      logger.error('Request body is missing.');
      res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
      return;
    }

    try {
      // ** CRUCIAL STEP: Decode the Base64 content to get the raw email text. **
      const decodedEmail = Buffer.from(base64Content, 'base64').toString('utf8');
      
      // ** NEW STEP: Extract only the XML portion from the decoded email. **
      const xmlContent = extractXml(decodedEmail);
      
      if (!xmlContent) {
        throw new Error('Could not extract valid XML from the email body.');
      }

      logger.log("Successfully decoded and extracted XML. Attempting to parse...");

      const parsed = await parseStringPromise(xmlContent, {
        explicitArray: false,
        trim: true,
        ignoreAttrs: true, // Simplified parsing
      });

      if (!parsed.adf || !parsed.adf.prospect) {
        throw new Error("ADF or prospect tag not found in the parsed XML.");
      }

      const prospect = parsed.adf.prospect;
      const customer = prospect.customer || {};
      const vehicle = prospect.vehicle || {};
      const contact = customer.contact || {};
      const name = contact.name || {};

      // Handle cases where name might be a simple string or an object with a "_" property
      const customerName = typeof name === 'object' ? name._ : name;
      
      const leadData = {
        customerName: customerName || "Name not found",
        vehicle: `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || "Vehicle not specified",
        comments: prospect.comments || "No comments provided.",
        status: 'new',
        timestamp: prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now(),
        suggestion: '',
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'gmail-webhook-vFinal', // Updated for tracking
      };
      
      await db.collection('email_leads').add(leadData);
      logger.log('Successfully wrote lead data to Firestore.');
      res.status(200).send('OK');

    } catch (e) {
      logger.error(`Critical lead processing failure: ${e.message}`, {
        errorStack: e.stack,
        // Log a sample of the raw, undecoded body for debugging if needed
        rawBodySample: base64Content.substring(0, 200) 
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
        raw: base64Content
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
