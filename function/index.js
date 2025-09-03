
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const express = require('express');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(express.text({ type: '*/*', limit: '10mb' }));

async function parseRawEmail(raw) {
  try {
    // Find the start of the XML content by looking for the first '<'
    const xmlStartIndex = raw.indexOf('<');
    if (xmlStartIndex === -1) {
      throw new Error('No XML content found in the email body.');
    }
    const xmlContent = raw.substring(xmlStartIndex);

    // Use xml2js to parse the XML content
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
    
    // Extract timestamp from the requestdate field, fallback to now
    const creationDate = prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now();

    return {
      customerName: customerName,
      vehicle: vehicleOfInterest,
      comments: comments,
      status: 'new',
      timestamp: creationDate,
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook-v3-xml2js',
    };
  } catch (e) {
    console.error(`Failed to parse XML, saving raw content. Error: ${e.message}`);
    // Return a structure that indicates a parsing failure, but still saves the raw data.
    return {
      customerName: 'Unparsed Lead',
      vehicle: 'Raw Email Data',
      comments: `Parsing failed. Raw content below.\n\nError: ${e.message}\n\nRaw Body:\n${raw}`,
      status: 'new',
      timestamp: Date.now(),
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook-error',
      raw: raw // Explicitly save raw content on error
    };
  }
}

app.post('/', async (req, res) => {
  try {
    const provided = req.get('X-Webhook-Secret');
    const expected = process.env.GMAIL_WEBHOOK_SECRET;

    console.log('Received webhook request.');

    if (provided !== expected) {
        console.warn(`Invalid webhook secret provided.`);
        return res.status(401).send('Invalid webhook secret');
    }

    console.log('Webhook secret validated successfully.');

    const raw = req.body;
    if (!raw || typeof raw !== 'string') {
        console.warn('Request body is missing or not a string.');
        return res.status(400).send('Missing raw body');
    }

    const leadData = await parseRawEmail(raw);

    console.log('Writing to email_leads collection...');
    await db.collection('email_leads').add(leadData);
    console.log('Successfully wrote to Firestore.');

    return res.status(200).send('OK');
  } catch (e) {
    console.error('receiveEmailLead critical error:', e.message, e.stack);
    // Try to save the raw body even on critical failure, to avoid data loss
    try {
      await db.collection('email_leads').add({
        raw: req.body || 'No body received',
        error: e.toString(),
        source: 'gmail-webhook-critical-error',
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (dbError) {
      console.error('Failed to save error record to Firestore:', dbError);
    }
    return res.status(500).send('Internal server error');
  }
});

exports.receiveEmailLead = onRequest(
  {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET'] 
  },
  app
);
