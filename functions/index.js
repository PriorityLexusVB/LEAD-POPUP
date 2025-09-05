
const { onRequest } = require('firebase-functions/v2/onRequest');
const admin = require('firebase-admin');
const { parseStringPromise } = require('xml2js');

admin.initializeApp();
// CORRECT: Point to the default database, which always exists.
const db = admin.firestore();

async function parseRawEmail(encodedBody) {
  try {
    if (!encodedBody || typeof encodedBody !== 'string' || encodedBody.length === 0) {
        throw new Error('Received empty or invalid request body.');
    }
    
    // Step 1: The incoming body is a Base64 encoded string from the script. Decode it.
    let decodedBody;
    try {
        decodedBody = Buffer.from(encodedBody, 'base64').toString('utf8');
    } catch (e) {
        throw new Error(`Base64 decoding failed: ${e.message}`);
    }

    // Step 2: Find the start of the XML content. The ADF format can sometimes have inconsistent casing.
    const adfStartIndex = decodedBody.toLowerCase().indexOf('<adf>');
    if (adfStartIndex === -1) {
      throw new Error('Could not find the start of the <adf> tag in the decoded email.');
    }
    
    // Slice the original string to maintain casing.
    const xmlContentWithHeaders = decodedBody.substring(adfStartIndex);
    
    // Step 3: Find the end of the XML content to remove any trailing data.
    const adfEndIndex = xmlContentWithHeaders.toLowerCase().lastIndexOf('</adf>');
    if (adfEndIndex === -1) {
        throw new Error('Could not find the end of the </adf> tag.');
    }

    // Step 4: Extract the clean XML content. The length of '</adf>' is 6.
    const xmlContent = xmlContentWithHeaders.substring(0, adfEndIndex + 6);
    
    // Step 5: Parse the extracted and cleaned XML content.
    const parsed = await parseStringPromise(xmlContent, { explicitArray: false, trim: true, ignoreAttrs: true });
    
    if (!parsed.adf || !parsed.adf.prospect) {
        throw new Error("ADF or prospect tag not found in the parsed XML.");
    }

    const prospect = parsed.adf.prospect;
    const customer = prospect.customer;
    const vehicle = prospect.vehicle;
    
    // Handle cases where name might be nested or directly a string
    const customerName = (customer && customer.contact && customer.contact.name && (customer.contact.name._ || customer.contact.name)) || "Name not found";
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
      source: 'gmail-webhook-default-db', 
    };
  } catch (parseError) {
      // Re-throw the error with more context to be caught by the main handler.
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
    // Firebase Functions provides a rawBody buffer on the request object when no middleware has parsed the body.
    // We convert it to a utf8 string to get the Base64 content sent from the script.
    const encodedBody = req.rawBody ? req.rawBody.toString('utf8') : undefined;

    try {
        const provided = req.get('X-Webhook-Secret');
        const expected = process.env.GMAIL_WEBHOOK_SECRET;

        if (provided !== expected) {
            console.warn(`Invalid webhook secret provided.`);
            res.status(401).send('Invalid webhook secret');
            return;
        }

        if (!encodedBody) {
            console.error('Request body is missing. This indicates a problem with the function configuration or the incoming request.');
            res.status(400).json({ ok: false, error: 'Bad request: Missing body' });
            return;
        }
        
        console.log("Received encoded body. Attempting to parse...");
        leadData = await parseRawEmail(encodedBody);
        console.log("Successfully parsed lead data.");

    } catch (e) {
        console.error(`Lead processing failed critically: ${e.message}`);
        console.error("--- Start Raw Body That Caused Error ---");
        console.error(encodedBody);
        console.error("--- End Raw Body ---");
        
        leadData = {
          customerName: 'Unparsed Lead',
          vehicle: 'Raw Email Data',
          comments: `Parsing failed. Raw content below.\n\nError: ${e.message}\n\n--- Start Raw Body ---\n${encodedBody}\n--- End Raw Body ---`,
          status: 'new',
          timestamp: Date.now(),
          suggestion: '',
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'gmail-webhook-error',
          raw: encodedBody
        };
        
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
