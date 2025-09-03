const { onRequest } = require('firebase-functions/v2/onRequest');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const express = require('express');

admin.initializeApp();
const db = admin.firestore();

const GMAIL_WEBHOOK_SECRET = defineSecret('GMAIL_WEBHOOK_SECRET');

const app = express();
app.use(express.text({ type: '*/*', limit: '10mb' }));

app.post('/', async (req, res) => {
  try {
    const provided = req.get('X-Webhook-Secret');
    const expected = GMAIL_WEBHOOK_SECRET.value();

    console.log('Received webhook request.');

    if (!provided) {
        console.warn('Webhook secret was not provided.');
        return res.status(401).send('Invalid webhook secret: Not provided');
    }
    
    if (provided !== expected) {
        console.warn(`Invalid webhook secret provided. Expected: "${expected}", but got: "${provided}"`);
        return res.status(401).send('Invalid webhook secret: Mismatch');
    }

    console.log('Webhook secret validated successfully.');

    const raw = req.body;
    if (!raw || typeof raw !== 'string') {
        console.warn('Request body is missing or not a string.');
        return res.status(400).send('Missing raw body');
    }

    console.log('Writing to email_leads collection...');
    await db.collection('email_leads').add({
      raw,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook',
      headers: { contentType: req.get('content-type') || null }
    });
    console.log('Successfully wrote to Firestore.');

    return res.status(200).send('OK');
  } catch (e) {
    console.error('receiveEmailLead critical error:', e);
    return res.status(500).send('Internal server error');
  }
});

exports.receiveEmailLead = onRequest({ secrets: [GMAIL_WEBHOOK_SECRET], region: 'us-central1' }, app);