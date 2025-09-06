
const { onRequest } = require("firebase-functions/v2/onRequest");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { parseStringPromise } = require("xml2js");

// Initialize Firebase Admin SDK.
admin.initializeApp();
// ** THE FIX IS HERE **
// Connect to the specific 'leads' database, not the default one.
const db = admin.firestore('leads');

/**
 * Receives email lead data from a webhook, parses it, and saves it to Firestore.
 * This version is simplified to match the expected data structure of the front-end.
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
      logger.warn("Unauthorized webhook attempt.");
      res.status(401).send('Invalid webhook secret');
      return;
    }
    
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    if (!rawBody) {
      logger.error('Request body is missing.');
      res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
      return;
    }

    let leadData;

    try {
      // Assuming the body is Base64 encoded XML string from Apps Script
      const decodedXml = Buffer.from(rawBody, 'base64').toString('utf8');
      
      // Find the start of the XML content, which could be <?xml or <adf
      let xmlStartIndex = decodedXml.indexOf('<?xml');
      if (xmlStartIndex === -1) {
        xmlStartIndex = decodedXml.indexOf('<adf>');
      }

      if (xmlStartIndex === -1) {
        throw new Error("Could not find '<?xml' or '<adf>' tag in the decoded email content.");
      }
      const xmlContent = decodedXml.substring(xmlStartIndex);

      const parsed = await parseStringPromise(xmlContent, {
        explicitArray: false,
        trim: true,
        ignoreAttrs: false, // Keep attributes to find name parts
      });
      
      const prospect = parsed.adf.prospect;
      const customer = prospect.customer || {};
      const vehicle = prospect.vehicle || {};
      const contact = customer.contact || {};
      const name = contact.name || {};

      // Extract name parts and construct a full name
      const nameParts = Array.isArray(name) ? name : [name];
      const customerName = nameParts.find(n => n.$?.part === 'full')?._ || 
                           `${nameParts.find(n => n.$?.part === 'first')?.['#text'] || ''} ${nameParts.find(n => n.$?.part === 'last')?.['#text'] || ''}`.trim() ||
                           'Unknown Lead';

      leadData = {
        format: 'adf',
        source: 'gmail-webhook',
        status: 'new',
        suggestion: '',
        comments: prospect.comments || `Inquiry about ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        timestamp: prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now(),
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        vehicle: {
          year: vehicle.year || null,
          make: vehicle.make || null,
          model: vehicle.model || null,
          vin: vehicle.vin || null,
        },
        customer: {
          name: customerName,
          email: contact.email || null,
          phone: contact.phone || null,
        },
      };

    } catch (e) {
      logger.error(`Error parsing lead: ${e.message}`, {
        errorStack: e.stack,
        rawBodySnippet: rawBody.substring(0, 500)
      });
      // Fallback: save the raw data if parsing fails
      leadData = {
          customer: { name: 'Unparsed Lead', email: null, phone: null },
          vehicle: { year: null, make: null, model: 'Raw Data' },
          comments: `Parsing failed. Error: ${e.message}. Raw content attached.`,
          status: 'new',
          timestamp: Date.now(),
          suggestion: '',
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'gmail-webhook-error',
          format: 'raw',
          raw: rawBody,
      };
    }
    
    // Use the 'email_leads' collection to separate from old data.
    await db.collection('email_leads').add(leadData);
    logger.log('Successfully wrote lead data to Firestore.', { customer: leadData.customer.name });
    res.status(200).send('OK');
  }
);
