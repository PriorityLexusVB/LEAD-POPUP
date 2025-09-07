
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {parseStringPromise} = require("xml2js");

// Initialize Firebase Admin SDK.
admin.initializeApp();
// Connect to the (default) database.
const db = admin.firestore();

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
      
      let decodedXml;
      try {
         // The body may be base64 encoded.
         decodedXml = Buffer.from(rawBody, "base64").toString("utf8");
      } catch (e) {
         // If decoding fails, assume it's already plain text.
         decodedXml = rawBody;
      }
      
      // Find all individual ADF documents in the body, case-insensitively.
      const adfDocs = decodedXml.match(/<adf>[\s\S]*?<\/adf>/gi);
      
      if (!adfDocs) {
          functions.logger.error("No <adf> documents found in the payload.", {
              rawBodySnippet: rawBody.substring(0, 500),
          });
          res.status(400).json({ok: false, error: "Bad request: No ADF data found"});
          return;
      }

      let processedCount = 0;
      for (const adfDoc of adfDocs) {
        try {
            const parsed = await parseStringPromise(adfDoc, {
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


            const leadData = {
              format: "adf",
              source: "gmail-webhook",
              status: "new",
              suggestion: "",
              comments:
                (customer.comments) ||
                `Inquiry about ${vehicleOfInterest.year || ''} ${vehicleOfInterest.make || ''} ${vehicleOfInterest.model || ''}`.trim(),
              timestamp: prospect.requestdate ?
                new Date(prospect.requestdate).getTime() :
                Date.now(),
              receivedAt: admin.firestore.FieldValue.serverTimestamp(),
              vehicle: {
                year: vehicleOfInterest.year || null,
                make: vehicleOfInterest.make || null,
                model: vehicleOfInterest.model || null,
                vin: vehicleOfInterest.vin || null,
              },
              customer: {
                name: customerName,
                email: contact.email || null,
                phone: phoneNumber,
              },
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
