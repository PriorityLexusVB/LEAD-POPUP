
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const express = require('express');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
const db = admin.firestore('leads');

const app = express();

// A middleware to capture the raw body, as express.text() is not behaving as expected.
app.use((req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

async function parseRawEmail(encodedBody) {
  try {
    if (!encodedBody || typeof encodedBody !== 'string' || encodedBody.length === 0) {
        throw new Error('Received empty or invalid request body.');
    }
    
    // Step 1: The incoming body is a Base64 encoded string from the script. Decode it.
    let decodedBody = Buffer.from(encodedBody, 'base64').toString('utf-8');

    // Step 2: Find the start of the XML content to ignore headers.
    const xmlStartIndex = decodedBody.indexOf('<adf>');
    if (xmlStartIndex === -1) {
      // If <adf> is not found, try for a case-insensitive match as a fallback.
      const lowerCaseBody = decodedBody.toLowerCase();
      const adfIndex = lowerCaseBody.indexOf('<adf>');
       if (adfIndex === -1) {
         throw new Error('Could not find the start of the <adf> tag in the decoded email.');
       }
       // If found, we must slice the original string, not the lowercase one.
       decodedBody = decodedBody.substring(adfIndex);
    } else {
        decodedBody = decodedBody.substring(xmlStartIndex);
    }
    
    // Step 3: Find the end of the XML content to remove any trailing data.
    const xmlEndIndex = decodedBody.lastIndexOf('</adf>');
    if (xmlEndIndex === -1) {
        throw new Error('Could not find the end of the </adf> tag.');
    }

    // Step 4: Extract the clean XML content. The length of '</adf>' is 6.
    const xmlContent = decodedBody.substring(0, xmlEndIndex + 6);
    
    // Step 5: Parse the extracted and cleaned XML content.
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
      source: 'gmail-webhook-final-fix-final',
    };
  } catch (parseError) {
      // Re-throw the error with more context to be caught by the main handler.
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
        res.status(401).send('Invalid webhook secret');
        return;
    }

    const encodedBody = req.rawBody; // Use the raw body we captured.
    if (!encodedBody) {
        console.warn('Request body is missing.');
        res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
        return;
    }

    // Attempt to parse the email.
    leadData = await parseRawEmail(encodedBody);

  } catch (e) {
    console.error(`Lead processing failed: ${e.message}`);
    // If any error occurs during parsing, create an error lead object.
    leadData = {
      customerName: 'Unparsed Lead',
      vehicle: 'Raw Email Data',
      comments: `Parsing failed. Raw content below.\n\nError: ${e.message}\n\n--- Start Raw Body ---\n${req.rawBody}\n--- End Raw Body ---`,
      status: 'new',
      timestamp: Date.now(),
      suggestion: '',
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'gmail-webhook-error',
      raw: req.rawBody // Explicitly save raw content on error for debugging
    };
    
    // Respond with a 400 Bad Request but still try to save the error log.
    res.status(400).json({ ok: false, error: `Bad request: ${e.message}` });
    
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
