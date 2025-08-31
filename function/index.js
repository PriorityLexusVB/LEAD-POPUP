const { onRequest } = require('firebase-functions/v2/https');
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
    if (!provided || provided !== expected) {
        console.warn('Invalid webhook secret provided.');
        return res.status(401).send('Invalid webhook secret');
    }

    const raw = req.body;
    if (!raw || typeof raw !== 'string') {
        console.warn('Request body is missing or not a string.');
        return res.status(400).send('Missing raw body');
    }

    await db.collection('leads_v2').add({
      raw,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook',
      headers: { contentType: req.get('content-type') || null }
    });

    return res.status(200).send('OK');
  } catch (e) {
    console.error('receiveEmailLead error:', e);
    return res.status(500).send('Internal error');
  }
});

exports.receiveEmailLead = onRequest({ secrets: [GMAIL_WEBHOOK_SECRET], region: 'us-central1' }, app);