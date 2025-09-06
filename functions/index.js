
const { onRequest } = require('firebase-functions/v2/onRequest');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { parseStringPromise } = require('xml2js');

// Initialize Firebase Admin SDK. By not passing any arguments, it will
// automatically use the configuration of the project it is deployed to.
admin.initializeApp();

// Get a reference to the default Firestore database.
const db = admin.firestore();

/**
 * Extracts the ADF XML content from a raw, decoded email body.
 * @param {string} decodedEmailContent The full raw content of the email, after Base64 decoding.
 * @return {string | null} The extracted XML string or null if not found.
 */
function extractXml(decodedEmailContent) {
  // The ADF/XML data is embedded within the email body.
  // We need to find the start of the XML declaration.
  logger.log("Attempting to find '<?xml' tag in decoded content.");
  const xmlStartIndex = decodedEmailContent.indexOf('<?xml');
  
  if (xmlStartIndex === -1) {
    logger.error("Could not find the start of the '<?xml' tag in the email content.");
    return null;
  }

  // Slice the string to get from the start of the XML tag to the end.
  const xmlContentWithPotentiallyTrailingData = decodedEmailContent.substring(xmlStartIndex);

  // Find the closing ADF tag to ensure we only parse valid XML.
  const adfEndIndex = xmlContentWithPotentiallyTrailingData.toLowerCase().lastIndexOf('</adf>');
  if (adfEndIndex === -1) {
    logger.error("Could not find the end of the '</adf>' tag.");
    return null;
  }

  // Extract the clean XML content. The "+6" accounts for the length of "</adf>".
  const cleanXml = xmlContentWithPotentiallyTrailingData.substring(0, adfEndIndex + 6);
  logger.log("Successfully extracted clean XML.", { snippet: cleanXml.substring(0, 200) });
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
    // 1. Authenticate the request.
    const providedSecret = req.get('X-Webhook-Secret');
    const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;

    if (providedSecret !== expectedSecret) {
      logger.warn("Unauthorized webhook attempt. Provided secret did not match expected secret.");
      res.status(401).send('Invalid webhook secret');
      return;
    }
    
    // 2. Get the raw request body (which is a Base64 string from Apps Script).
    const base64Content = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    if (!base64Content) {
      logger.error('Request body is missing.');
      res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
      return;
    }

    // --- START DEBUGGING ---
    logger.log("Received raw body. Length:", base64Content.length);
    logger.log("Raw Body Snippet (first 500 chars):", base64Content.substring(0, 500));
    // --- END DEBUGGING ---

    let decodedEmail;
    try {
      // 3. **CRUCIAL STEP:** Decode the Base64 content to get the raw email text.
      decodedEmail = Buffer.from(base64Content, 'base64').toString('utf8');
      
      // --- START DEBUGGING ---
      logger.log("Successfully decoded Base64 content.");
      logger.log("Decoded Email Snippet (first 500 chars):", decodedEmail.substring(0, 500));
      // --- END DEBUGGING ---

    } catch (e) {
       logger.error("Base64 decoding failed.", { errorMessage: e.message });
       res.status(400).json({ ok: false, error: "Bad request: Base64 decoding failed." });
       return;
    }
      
    // 4. **CRUCIAL STEP:** Extract only the XML portion from the decoded email.
    const xmlContent = extractXml(decodedEmail);
      
    if (!xmlContent) {
      logger.error("Could not extract valid XML from the decoded email body.");
      res.status(400).json({ ok: false, error: "Bad request: Could not extract XML." });
      return;
    }

    try {
      logger.log("Attempting to parse the extracted XML.");
      // 5. Parse the clean XML.
      const parsed = await parseStringPromise(xmlContent, {
        explicitArray: false,
        trim: true,
        ignoreAttrs: true,
      });

      if (!parsed.adf || !parsed.adf.prospect) {
        throw new Error("ADF or prospect tag not found in the parsed XML.");
      }

      const prospect = parsed.adf.prospect;
      const customer = prospect.customer || {};
      const vehicle = prospect.vehicle || {};
      const contact = customer.contact || {};
      const name = contact.name || {};
      
      const customerName = typeof name === 'object' ? name._ : name;
      
      const leadData = {
        customerName: customerName || "Name not found",
        vehicle: `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || "Vehicle not specified",
        comments: prospect.comments || "No comments provided.",
        status: 'new',
        timestamp: prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now(),
        suggestion: '',
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'gmail-webhook-vFinal-CorrectProject-Debug',
      };
      
      await db.collection('email_leads').add(leadData);
      logger.log('Successfully wrote lead data to Firestore.', { leadId: leadData.customerName });
      res.status(200).send('OK');

    } catch (e) {
      logger.error(`Critical lead processing failure during XML parsing or DB write: ${e.message}`, {
        errorStack: e.stack,
        xmlContentBeingParsed: xmlContent // Log the exact XML that failed
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
        source: 'gmail-webhook-error-debug',
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
