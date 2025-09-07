
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {parseStringPromise} = require("xml2js");

// Initialize Firebase Admin SDK.
admin.initializeApp();
// Connect to the (default) database.
const db = admin.firestore();

/**
 * Sanitizes an XML string by replacing ampersands that are not part of a valid XML entity.
 * This prevents parsing errors from characters like &mdash;.
 * @param {string} str The XML string to sanitize.
 * @return {string} The sanitized XML string.
 */
function sanitizeXml(str) {
  // This regex looks for an ampersand that is NOT followed by 'amp;', 'lt;', 'gt;', 'apos;', or 'quot;'
  return str.replace(/&(?!(amp;|lt;|gt;|apos;|quot;))/g, '&amp;');
}

function normalizeWhitespace(s) {
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .join("\n");
}

function extractUrls(block) {
  const urls = [];
  const re = /\bhttps?:\/\/[^\s)"]+/gi;
  let m; while ((m = re.exec(block))) urls.push(m[0]);
  return urls;
}

// Question / Answer lines like:
//   Question: ... 
//   Check: yes|no|no response
//   Response: <free text>
function extractQAPairs(block) {
  const lines = normalizeWhitespace(block).split("\n");
  const qas = [];
  for (let i = 0; i < lines.length; i++) {
    const q = lines[i].match(/^Question:\s*(.+)$/i);
    if (!q) continue;
    let answer = null, check = null;
    if (i + 1 < lines.length) {
      const ck = lines[i + 1].match(/^Check:\s*(.+)$/i);
      if (ck) { check = ck[1].trim(); i++; }
    }
    if (i + 1 < lines.length) {
      const r = lines[i + 1].match(/^Response:\s*(.+)$/i);
      if (r) { answer = r[1].trim(); i++; }
    }
    qas.push({ question: q[1].trim(), check: check || null, answer: answer || null });
  }
  return qas;
}

function extractSchedule(block) {
  const dateM = block.match(/Schedule Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  const timeM = block.match(/Schedule Time:\s*([0-9]{2}:[0-9]{2}:[0-9]{2})/i);
  return {
    date: dateM ? dateM[1] : null,
    time: timeM ? timeM[1] : null,
  };
}

function extractPreferredContact(block) {
  const m = block.match(/Preferred Contact Method[^:]*:\s*([A-Za-z]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function extractTrade(block) {
  const urlM = block.match(/Trade Summary:\s*(https?:\/\/\S+)/i);
  return { tradeUrl: urlM ? urlM[1] : null };
}

function extractCampaign(block) {
  // Flexible grab for common lines; extend as needed.
  const src  = block.match(/(?:Primary PPC Campaign\s*)?Source:\s*([^\n]+)/i);
  const name = block.match(/Campaign Name:\s*([^\n]+)/i);
  const adg  = block.match(/AdGroup Name:\s*([^\n]+)/i);
  const kw   = block.match(/Keyword:\s*([^\n]+)/i);
  const clickId = block.match(/Click Id:\s*([^\n]+)/i);
  return {
    source: src ? src[1].trim() : null,
    campaignName: name ? name[1].trim() : null,
    adGroup: adg ? adg[1].trim() : null,
    keyword: kw ? kw[1].trim() : null,
    clickId: clickId ? clickId[1].trim() : null,
  };
}

function parseCommentsToStructured(blockRaw) {
  const block = normalizeWhitespace(blockRaw || "");
  const { date, time } = extractSchedule(block);
  const { tradeUrl } = extractTrade(block);
  const preferredContact = extractPreferredContact(block);
  const campaign = extractCampaign(block);
  const urls = extractUrls(block);
  const qas = extractQAPairs(block);
  // Label a few known URLs for convenience
  const clickPath = urls.find(u => /\/leadinfo\/clickpath\//i.test(u)) || null;
  const returnShopper = urls.find(u => /\/iSpy\/Sales\//i.test(u)) || null;
  return {
    raw: blockRaw || null,
    preferredContact, campaign, qas,
    schedule: (date || time) ? { date, time } : null,
    trade: tradeUrl ? { url: tradeUrl } : null,
    links: { clickPath, returnShopper, all: urls }
  };
}


/**
 * Receives email lead data from a webhook, parses it,
 * and saves it to Firestore.
 */
exports.receiveEmailLead = functions
    .region("us-central1")
    .runWith({
      secrets: ["GMAIL_WEBHOOK_SECRET"],
    })
    .https.onRequest(async (req, res) => {
      // 1. Authenticate the request.
      const providedSecret = req.get("X-Webhook-Secret");
      const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;

      if (providedSecret !== expectedSecret) {
        functions.logger.warn("Unauthorized webhook attempt.");
        res.status(401).send("Invalid webhook secret");
        return;
      }

      const rawBody = req.rawBody ? req.rawBody.toString("utf8") : undefined;

      if (!rawBody) {
        functions.logger.error("Request body is missing.");
        res.status(400).json({ok: false, error: "Bad request: Missing body"});
        return;
      }
      
      let decodedData;
      try {
         // Gmail uses base64url encoding; normalize it to standard base64 before decoding.
         const base64 = rawBody.replace(/-/g, '+').replace(/_/g, '/');
         decodedData = Buffer.from(base64, "base64").toString("utf8");
      } catch (e) {
         // If decoding fails, assume it's already plain text.
         decodedData = rawBody;
      }
      
      // Attempt to parse as JSON first
      try {
        const jsonData = JSON.parse(decodedData);
        if (jsonData.prospect && jsonData.prospect.customer) {
            functions.logger.log("Processing lead as JSON.");
            const prospect = jsonData.prospect;
            const customer = prospect.customer || {};
            const vehicle = prospect.vehicle || {};
            const contact = customer.contact || {};

             const leadData = {
              format: "json",
              source: "gmail-webhook",
              status: "new",
              suggestion: "",
              comments: customer.comments || `Inquiry about ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim(),
              timestamp: prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now(),
              receivedAt: admin.firestore.FieldValue.serverTimestamp(),
              vehicle: {
                year: vehicle.year || null,
                make: vehicle.make || null,
                model: vehicle.model || null,
                vin: vehicle.vin || null,
              },
              customer: {
                name: contact.name ? (contact.name.full || `${contact.name.first || ''} ${contact.name.last || ''}`.trim()) : 'Unknown Lead',
                email: contact.email || null,
                phone: contact.phone || null,
              },
            };
            
            await db.collection("email_leads").add(leadData);
            functions.logger.log("Successfully wrote JSON lead data to Firestore.", { customer: leadData.customer.name });
            res.status(200).send("OK. Processed JSON lead.");
            return;
        }
      } catch (jsonError) {
        functions.logger.log("Payload is not valid JSON, falling back to XML/ADF parsing.");
      }


      // Find all individual ADF documents in the body, case-insensitively.
      const adfDocs = decodedData.match(/<adf>[\s\S]*?<\/adf>/gi);
      
      if (!adfDocs) {
          functions.logger.error("No <adf> documents found in the payload.", {
              rawBodySnippet: rawBody.substring(0, 500),
          });
          res.status(400).json({ok: false, error: "Bad request: No ADF or valid JSON data found"});
          return;
      }

      let processedCount = 0;
      for (const adfDoc of adfDocs) {
        try {
            // Sanitize the XML doc to handle invalid entities before parsing.
            const safeDoc = sanitizeXml(adfDoc);
            const parsed = await parseStringPromise(safeDoc, {
                explicitArray: false, // Prevents single elements from being wrapped in an array
                trim: true,
                ignoreAttrs: false, // Keep attributes to check 'interest' and 'part'
            });

            if (!parsed.adf || !parsed.adf.prospect) {
                // This specific doc is invalid, skip it.
                functions.logger.warn("Skipping invalid ADF doc, missing prospect.", {adfDoc});
                continue;
            }

            const prospect = parsed.adf.prospect;
            const customer = prospect.customer || {};
            const vehicleData = prospect.vehicle; // Can be an array or object
            const contact = customer.contact || {};
            const nameData = contact.name || {};
            
            // Handle single vs. multiple vehicles by finding the one of interest.
            const vehicleArray = Array.isArray(vehicleData) ? vehicleData : [vehicleData];
            const vehicleOfInterest = vehicleArray.find(v => v && v.$ && v.$.interest === 'buy') || vehicleArray[0] || {};

            // Handle name parts to assemble a full name.
            const nameParts = Array.isArray(nameData) ? nameData : [nameData];
            const fNamePart = nameParts.find((n) => n && n.$ && n.$.part === "first");
            const lNamePart = nameParts.find((n) => n && n.$ && n.$.part === "last");

            let customerName = "Unknown Lead";
            // Logic to construct full name from parts
            if (fNamePart && fNamePart._ && lNamePart && lNamePart._) {
                customerName = `${fNamePart._} ${lNamePart._}`.trim();
            } else if (fNamePart && fNamePart._) {
                customerName = fNamePart._;
            } else if (lNamePart && lNamePart._) {
                customerName = lNamePart._;
            } else if (typeof contact.name === 'string') {
                customerName = contact.name;
            }


            // Handle phone numbers which can be an array
            let phoneNumber = null;
            if (contact.phone) {
                if(Array.isArray(contact.phone)) {
                    // Take the first available phone number
                    phoneNumber = contact.phone[0]._ || contact.phone[0];
                } else if(typeof contact.phone === 'object') {
                    phoneNumber = contact.phone._;
                } else {
                    phoneNumber = contact.phone;
                }
            }
            
            // comments can be on customer or vehicle; prefer customer->comments
            const commentsText =
              (typeof customer.comments === "string" ? customer.comments :
               typeof vehicleOfInterest?.comments === "string" ? vehicleOfInterest.comments :
               null);

            const structured = parseCommentsToStructured(commentsText);


            const leadData = {
              format: "adf",
              source: "gmail-webhook",
              status: "new",
              suggestion: "",
              comments: structured.raw, // keep the original text
              timestamp: prospect.requestdate ? new Date(prospect.requestdate).getTime() : Date.now(),
              receivedAt: admin.firestore.FieldValue.serverTimestamp(),
              vehicle: {
                year: vehicleOfInterest.year || null,
                make: vehicleOfInterest.make || null,
                model: vehicleOfInterest.model || null,
                vin: vehicleOfInterest.vin || null,
                price: vehicleOfInterest.price || null,
                odometer: vehicleOfInterest.odometer || null,
              },
              customer: {
                name: customerName,
                email: contact.email || null,
                phone: phoneNumber,
                preferredContact: structured.preferredContact,
                postalCode: customer?.contact?.address?.postalcode || null,
              },
              schedule: structured.schedule,     // { date, time } or null
              trade: structured.trade,           // { url } or null
              campaign: structured.campaign,     // { source, campaignName, adGroup, keyword, clickId }
              links: structured.links,           // { clickPath, returnShopper, all:[…] }
              questions: structured.qas,         // [{question, check, answer}, …]
            };
            
            await db.collection("email_leads").add(leadData);
            functions.logger.log("Successfully wrote lead data to Firestore.", {
                customer: leadData.customer.name,
            });
            processedCount++;

        } catch (e) {
            functions.logger.error(`Error parsing one of the ADF docs: ${e.message}`, {
                errorStack: e.stack,
                failingAdfDoc: adfDoc,
                fullPayload: rawBody, // Store full context on error
            });
            // Fallback: save the raw data if parsing fails for this specific doc
            const errorData = {
              customer: {name: "Unparsed Lead", email: null, phone: null},
              vehicle: {year: null, make: null, model: "Raw Data"},
              comments: "Parsing failed. Raw content attached.",
              status: "new",
              timestamp: Date.now(),
              suggestion: "",
              receivedAt: admin.firestore.FieldValue.serverTimestamp(),
              source: "gmail-webhook-error",
              format: "raw",
              raw: adfDoc, // Save the specific failing XML block
              rawFullPayload: rawBody // Save the original full payload
            };
            await db.collection("email_leads").add(errorData);
        }
      }

      res.status(200).send(`OK. Processed ${processedCount} of ${adfDocs.length} leads.`);
    });
    
