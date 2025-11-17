"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiveEmailLead = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const mailparser_1 = require("mailparser");
const adf_1 = require("./normalizers/adf");
const chat_1 = require("./normalizers/chat");
const classify_1 = require("./ingest/classify");
const firebase_1 = require("./firebase");
const db = firebase_1.firestore;
const FN_OPTS = {
    region: 'us-central1',
    secrets: ['GMAIL_WEBHOOK_SECRET'],
    memory: '256MiB',
    timeoutSeconds: 120,
};
function base64UrlToUtf8(maybeB64Url) {
    const s = (maybeB64Url || '').trim();
    if (s.startsWith('Delivered-To:') || s.startsWith('Return-Path:') || s.startsWith('From:')) {
        return s;
    }
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf8');
}
exports.receiveEmailLead = functions.runWith(FN_OPTS).https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const { logger } = functions;
    try {
        const providedSecret = req.get('X-Webhook-Secret');
        const expectedSecret = process.env.GMAIL_WEBHOOK_SECRET;
        if (providedSecret !== expectedSecret) {
            logger.warn('unauthorized webhook attempt');
            return res.status(401).json({ ok: false, error: 'unauthorized' });
        }
        const rawBodyStr = (typeof req.body === 'string') ? req.body :
            (Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : '');
        if (!rawBodyStr) {
            return res.status(400).json({ ok: false, error: 'missing_body' });
        }
        const rfc822 = base64UrlToUtf8(rawBodyStr);
        const parsed = await (0, mailparser_1.simpleParser)(rfc822);
        const msgId = parsed.messageId || req.get('X-Gmail-Message-Id') || `gen_${Date.now()}`;
        const subject = parsed.subject;
        const from = (_a = parsed.from) === null || _a === void 0 ? void 0 : _a.text;
        const text = parsed.text || "";
        const html = parsed.html;
        const receivedAt = parsed.date || new Date();
        const raw = html || text || "";
        let lead = null;
        if (raw.includes("<adf") || raw.includes("<ProcessSalesLead")) {
            lead = (0, adf_1.normalizeAny)(raw);
        }
        else if ((0, chat_1.looksLikeChatLead)(subject, from, text)) {
            lead = (0, chat_1.normalizeChatPlain)({ msgId, subject, from, text, receivedAt });
        }
        if (!lead) {
            logger.info(`Not a parsable lead. Subject: ${subject}`);
            await db.collection("unparsed_leads").add({
                msgId,
                subject,
                from,
                receivedAt: new Date(),
                snippet: raw.slice(0, 4000)
            });
            return res.status(202).send("accepted_unparsed");
        }
        const providerName = (_c = ((_b = /\<provider\>[\s\S]*?\<name[^>]*\>([\s\S]*?)\<\/name\>/.exec(raw)) === null || _b === void 0 ? void 0 : _b[1])) === null || _c === void 0 ? void 0 : _c.trim();
        const providerService = (_e = ((_d = /\<provider\>[\s\S]*?\<service[^>]*\>([\s\S]*?)\<\/service\>/.exec(raw)) === null || _d === void 0 ? void 0 : _d[1])) === null || _e === void 0 ? void 0 : _e.trim();
        const providerUrl = (_g = ((_f = /\<provider\>[\s\S]*?\<url[^>]*\>([\s_S]*?)\<\/url\>/.exec(raw)) === null || _f === void 0 ? void 0 : _f[1])) === null || _g === void 0 ? void 0 : _g.trim();
        const starSenderName = (_j = ((_h = /\<SenderNameCode\>([^<]+)\<\/SenderNameCode\>/.exec(raw)) === null || _h === void 0 ? void 0 : _h[1])) === null || _j === void 0 ? void 0 : _j.trim();
        const starCreator = (_l = ((_k = /\<CreatorNameCode\>([^<]+)\<\/CreatorNameCode\>/.exec(raw)) === null || _k === void 0 ? void 0 : _k[1])) === null || _l === void 0 ? void 0 : _l.trim();
        const classified = (0, classify_1.classifyLeadSource)(lead, {
            subject, fromAddr: from, rawText: text,
            providerName, providerService, providerUrl,
            starSenderName, starCreator,
        });
        const createdAtDate = new Date(classified.createdAt);
        const createdAtMs = createdAtDate.getTime();
        const createdAtISO = createdAtDate.toISOString();
        const finalPayload = Object.assign(Object.assign({}, classified), { createdAtMs,
            createdAtISO, createdAt: admin.firestore.Timestamp.fromDate(createdAtDate), receivedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection("leads_v2").doc(classified.id).set(finalPayload, { merge: true });
        logger.info(`Successfully parsed and saved lead: ${classified.id} from ${classified.vendor}`);
        return res.status(200).send("ok");
    }
    catch (err) {
        logger.error('receiveEmailLead_uncaught', {
            error: err.message,
            stack: err.stack,
            body: req.body
        });
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});
//# sourceMappingURL=index.js.map