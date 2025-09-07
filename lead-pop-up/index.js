
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {parseStringPromise} = require("xml2js");

// Initialize Firebase Admin SDK.
admin.initializeApp();
// Connect to the specific 'pop-up-leads' database.
const db = admin.firestore();

/**
 * Receives email lead data from a webhook, parses it,
 * and saves it to Firestore using v1 Cloud Functions syntax.
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

      let leadData;

      try {
        // The entire body from Google Apps Script can be Base64 encoded.
        // We must decode it first to get the plain text email content.
        // A try-catch block handles cases where it might not be encoded.
        let decodedXml;
        try {
           decodedXml = Buffer.from(rawBody, "base64").toString("utf8");
        } catch(e) {
           decodedXml = rawBody;
        }


        // Find the start of the XML content.
        const adfStartIndex = decodedXml.toLowerCase().indexOf("<adf>");
        if (adfStartIndex === -1) {
          throw new Error("Could not find the start of the <adf> tag.");
        }

        // Find the end of the XML content to isolate it.
        const adfEndIndex = decodedXml.toLowerCase().lastIndexOf("</adf>");
        if (adfEndIndex === -1) {
          throw new Error("Could not find the end of the </adf> tag.");
        }

        // Extract the precise XML content.
        const xmlContent = decodedXml.substring(
            adfStartIndex,
            adfEndIndex + "</adf>".length,
        );

        const parsed = await parseStringPromise(xmlContent, {
          explicitArray: false,
          trim: true,
          ignoreAttrs: false,
        });

        const prospect = parsed.adf.prospect;
        const customer = prospect.customer || {};
        const vehicleData = prospect.vehicle; // Can be an array or object
        const contact = customer.contact || {};
        const nameData = contact.name || {};
        
        // Handle single vs. multiple vehicles
        const vehicleArray = Array.isArray(vehicleData) ? vehicleData : [vehicleData];
        const vehicleOfInterest = vehicleArray.find(v => v && v.$ && v.$.interest === 'buy') || vehicleArray[0] || {};


        const nameParts = Array.isArray(nameData) ? nameData : [nameData];
        const fullNamePart = nameParts.find((n) => n && n.$ && n.$.part === "full");
        const fNamePart = nameParts.find((n) => n && n.$ && n.$.part === "first");
        const lNamePart = nameParts.find((n) => n && n.$ && n.$.part === "last");

        const customerName =
        (fullNamePart && fullNamePart._) ||
        `${(fNamePart && fNamePart._) || ""} ${
          (lNamePart && lNamePart._) || ""
        }`.trim() ||
        "Unknown Lead";


        leadData = {
          format: "adf",
          source: "gmail-webhook",
          status: "new",
          suggestion: "",
          comments:
            prospect.comments ||
            `Inquiry about ${vehicleOfInterest.year} ${vehicleOfInterest.make} ${vehicleOfInterest.model}`,
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
            phone: contact.phone || null,
          },
        };
      } catch (e) {
        functions.logger.error(`Error parsing lead: ${e.message}`, {
          errorStack: e.stack,
          rawBodySnippet: rawBody.substring(0, 500),
        });
        // Fallback: save the raw data if parsing fails
        leadData = {
          customer: {name: "Unparsed Lead", email: null, phone: null},
          vehicle: {year: null, make: null, model: "Raw Data"},
          comments: "Parsing failed. Raw content attached.",
          status: "new",
          timestamp: Date.now(),
          suggestion: "",
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: "gmail-webhook-error",
          format: "raw",
          raw: rawBody,
        };
      }

      await db.collection("email_leads").add(leadData);
      functions.logger.log("Successfully wrote lead data to Firestore.", {
        customer: leadData.customer.name,
      });
      res.status(200).send("OK");
    });
