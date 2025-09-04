
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const express = require('express');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
const db = admin.firestore('leads');

const app = express();
// Increase limit to handle base64 encoded body
app.use(express.text({ type: '*/*', limit: '10mb' }));

async function parseRawEmail(encodedBody) {
  // This function will now throw an error if parsing fails, which will be caught by the caller.
  
  // Step 1: Decode the Base64 string to get the raw email content.
  const rawDecodedBody = Buffer.from(encodedBody, 'base64').toString('utf8');

  // Step 2: Find the start of the XML content by looking for the first '<' character.
  const xmlStartIndex = rawDecodedBody.indexOf('<');
  if (xmlStartIndex === -1) {
    throw new Error('No XML content found in the decoded email body.');
  }
  const xmlContent = rawDecodedBody.substring(xmlStartIndex);

  // Step 3: Parse the extracted XML content.
  const parsed = await parseStringPromise(xmlContent, { explicitArray: false, trim: true });
  
  if (!parsed.adf || !parsed.adf.prospect) {
      throw new Error("ADF or prospect tag not found in XML");
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
    source: 'gmail-webhook-v4-final',
  };
}

app.post('/', async (req, res) => {
  let leadData;
  try {
    const provided = req.get('X-Webhook-Secret');
    const expected = process.env.GMAIL_WEBHOOK_SECRET;

    console.log('Received webhook request.');

    if (provided !== expected) {
        console.warn(`Invalid webhook secret provided.`);
        return res.status(401).send('Invalid webhook secret');
    }

    console.log('Webhook secret validated successfully.');

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
      comments: `Parsing failed. Raw content below.\n\nError: ${e.message}\n\nRaw Body:\n${req.body}`,
      status: 'new',
      timestamp: Date.now(),
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook-error',
      raw: req.body // Explicitly save raw content on error
    };
  }

  try {
    // Always attempt to write the result (either parsed data or an error record) to Firestore.
    console.log('Writing lead data to email_leads collection in "leads" database...');
    await db.collection('email_leads').add(leadData);
    console.log('Successfully wrote lead data to Firestore.');
    
    return res.status(200).send('OK');
  } catch (dbError) {
    console.error('CRITICAL: Failed to write to Firestore:', dbError.message, dbError.stack);
    // This is a critical failure, e.g., Firestore permissions are wrong.
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
