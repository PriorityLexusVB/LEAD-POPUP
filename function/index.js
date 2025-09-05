
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
// Point to the default database, which always exists.
const db = admin.firestore();

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
        leadData = await parseRawEmail(rawBody);
        console.log("Successfully parsed lead data.");

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
            await db.collection('email_leads').add(leadData);
        } catch (dbError) {
            console.error('CRITICAL: Failed to write ERROR lead to Firestore:', dbError.message, dbError.stack);
        }
        
        res.status(400).json({ ok: false, error: `Bad request: ${e.message}` });
        return;
    }

    try {
        await db.collection('email_leads').add(leadData);
        console.log('Successfully wrote lead data to Firestore.');
        res.status(200).send('OK');
    } catch (dbError) {
        console.error('CRITICAL: Failed to write SUCCESS lead to Firestore:', dbError.message, dbError.stack);
        res.status(500).send('Internal server error: Could not write to database.');
    }
  }
);
