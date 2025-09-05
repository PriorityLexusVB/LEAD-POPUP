
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const express = require('express');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
const db = admin.firestore('leads');

const app = express();
app.use(express.text({ type: '*/*', limit: '10mb' }));

async function parseRawEmail(encodedBody) {
  try {
    // Step 1: Decode the Base64 string to get the raw email content.
    // This is the critical step to handle the payload from Google Apps Script.
    let decodedBody = Buffer.from(encodedBody, 'base64').toString('utf8');

    // Step 2: Clean the decoded string. Remove any leading characters or BOM.
    // The '\uFEFF' is the byte order mark that can sometimes be present.
    decodedBody = decodedBody.trim().replace(/^\uFEFF/, '');

    // Step 3: Find the start and end of the XML content. This is a more robust
    // way to handle raw email content which includes headers and other text.
    const xmlStartIndex = decodedBody.indexOf('<adf>');
    const xmlEndIndex = decodedBody.lastIndexOf('</adf>');

    if (xmlStartIndex === -1 || xmlEndIndex === -1) {
      throw new Error('Could not find <adf> or </adf> tags in the decoded email body.');
    }

    // Extract ONLY the XML content. The +6 is the length of '</adf>'.
    const xmlContent = decodedBody.substring(xmlStartIndex, xmlEndIndex + 6);
    
    // Step 4: Parse the extracted and cleaned XML content.
    const parsed = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
    
    if (!parsed.adf || !parsed.adf.prospect) {
        throw new Error("ADF or prospect tag not found in the parsed XML.");
    }

    const prospect = parsed.adf.prospect;
    const customer = prospect.customer;
    const vehicle = prospect.vehicle;
    
    const customerName = customer?.contact?.name?._ || customer?.contact?.name || "Name not found";
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
      source: 'gmail-webhook-v5-robust', // Updated version for tracking
    };
  } catch (parseError) {
      // Re-throw the error with more context to be caught by the main handler.
      // This allows us to log the exact content that failed to parse.
      throw new Error(`Parsing failed: ${parseError.message}`);
  }
}

app.post('/', async (req, res) => {
  let leadData;
  try {
    const provided = req.get('X-Webhook-Secret');
    const expected = process.env.GMAIL_WEBHOOK_SECRET;

    if (provided !== expected) {
        console.warn(`Invalid webhook secret provided.`);
        return res.status(401).send('Invalid webhook secret');
    }

    const encodedBody = req.body;
    if (!encodedBody || typeof encodedBody !== 'string') {
        console.warn('Request body is missing or not a string.');
        return res.status(400).send('Missing raw body');
    }

    // Attempt to parse the email.
    leadData = await parseRawEmail(encodedBody);

  } catch (e) {
    console.error(`Lead processing failed: ${e.message}`);
    // If any error occurs during parsing, create an error lead object.
    leadData = {
      customerName: 'Unparsed Lead',
      vehicle: 'Raw Email Data',
      comments: `Parsing failed. Raw content below.\n\nError: ${e.message}\n\n--- Start Raw Body ---\n${req.body}\n--- End Raw Body ---`,
      status: 'new',
      timestamp: Date.now(),
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook-error',
      raw: req.body // Explicitly save raw content on error for debugging
    };
    // Send a 400 Bad Request response when parsing fails.
    res.status(400).json({ ok: false, error: `Bad request: ${e.message}` });
    
    // Still try to write the error to Firestore for inspection.
    try {
        await db.collection('email_leads').add(leadData);
    } catch (dbError) {
        console.error('CRITICAL: Failed to write error lead to Firestore:', dbError.message, dbError.stack);
    }
    return; // Stop execution
  }

  try {
    // If parsing was successful, write the lead data to Firestore.
    await db.collection('email_leads').add(leadData);
    console.log('Successfully wrote lead data to Firestore.');
    return res.status(200).send('OK');
  } catch (dbError) {
    console.error('CRITICAL: Failed to write success lead to Firestore:', dbError.message, dbError.stack);
    return res.status(500).send('Internal server error: Could not write to database.');
  }
});

exports.receiveEmailLead = onRequest(
  {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET'] 
  },
  app
);
