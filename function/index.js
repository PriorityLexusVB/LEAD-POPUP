
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const express = require('express');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(express.text({ type: '*/*', limit: '10mb' }));

function parseRawEmail(raw) {
  try {
    // Find the start of the XML content
    const xmlStartIndex = raw.indexOf('<');
    if (xmlStartIndex === -1) {
      throw new Error('No XML content found in the email body.');
    }
    const xmlContent = raw.substring(xmlStartIndex);

    const timestampMatch = xmlContent.match(/<creationdate[^>]*>(.*?)<\/creationdate>/s);
    const timestamp = timestampMatch ? new Date(timestampMatch[1]).getTime() : Date.now();

    const customerNameMatch = xmlContent.match(/<customer[^>]*>.*?<name part="full">(.*?)<\/name>.*?<\/customer>/s);
    const vehicleMatch = xmlContent.match(/<vehicle[^>]*>.*?<make>(.*?)<\/make>.*?<model>(.*?)<\/model>.*?<\/vehicle>/s);
    const commentsMatch = xmlContent.match(/<comments>(.*?)<\/comments>/s);

    const customerName = customerNameMatch ? customerNameMatch[1].trim() : "Name not found";
    const vehicle = vehicleMatch ? `${vehicleMatch[1].trim()} ${vehicleMatch[2].trim()}` : "Vehicle not specified";
    const comments = commentsMatch ? commentsMatch[1].trim() : "No comments provided.";

    return {
      customerName,
      vehicle,
      comments,
      status: 'new',
      timestamp,
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook',
    };
  } catch (e) {
    console.error(`Failed to parse XML, saving raw content. Error: ${e}`);
    // Return a structure that indicates a parsing failure, but still saves the raw data.
    return {
      customerName: 'Unparsed Lead',
      vehicle: 'Raw Email Data',
      comments: `Parsing failed. Raw content: ${raw}`,
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

    if (!provided) {
        console.warn('Webhook secret was not provided in header.');
        return res.status(401).send('Invalid webhook secret: Not provided');
    }
    
    if (!expected) {
        console.error('CRITICAL: GMAIL_WEBHOOK_SECRET is not set in the function environment.');
        return res.status(500).send('Internal configuration error: Secret not configured.');
    }

    if (provided !== expected) {
        console.warn(`Invalid webhook secret provided.`);
        return res.status(401).send('Invalid webhook secret: Mismatch');
    }

    console.log('Webhook secret validated successfully.');

    const raw = req.body;
    if (!raw || typeof raw !== 'string') {
        console.warn('Request body is missing or not a string.');
        return res.status(400).send('Missing raw body');
    }

    const leadData = parseRawEmail(raw);

    console.log('Writing to email_leads collection...');
    await db.collection('email_leads').add(leadData);
    console.log('Successfully wrote to Firestore.');

    return res.status(200).send('OK');
  } catch (e) {
    console.error('receiveEmailLead critical error:', e);
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
