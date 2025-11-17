"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDealerEProcess = normalizeDealerEProcess;
exports.normalizeLexusSTAR = normalizeLexusSTAR;
exports.normalizeAny = normalizeAny;
const fast_xml_parser_1 = require("fast-xml-parser");
/* ---------- utils ---------- */
const uniq = (a) => Array.from(new Set(a));
const safe = (s) => (s !== null && s !== void 0 ? s : "").trim() || undefined;
const xml = new fast_xml_parser_1.XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const MESSAGE_KEYS = /(comment|message|notes?|anything else|questions?)/i;
const normAns = (a) => {
    const s = (a || "").trim().replace(/^"|"$/g, "");
    if (!s || /^(no|none|n\/a|na|no response)$/i.test(s))
        return undefined;
    return s;
};
function extractDEP(cdata) {
    var _a, _b, _c;
    const rawLines = (cdata || "").split(/\r?\n/);
    const lines = rawLines.map(l => l.replace(/\u00A0/g, " ").trim()).filter(Boolean);
    const clickPaths = [];
    const dashboardLinks = [];
    const qa = [];
    let preferred;
    let priceFromBlob;
    const NOISE = [
        /primary ppc campaign/i, /secondary ppc campaign/i,
        /^source:/i, /^price:/i, /\bclick id:/i, /\bexpires:/i, /\bnetwork type:/i,
        /\blexus dealercode/i, /\blexus sourceid/i, /\bvehicle prices\b/i,
        /\bdatetime:/i, /\bsara details:/i, /\beverest dr details:/i,
        /\bcountry:/i, /\bbodystyle:/i, /\btransmission:/i, /\bcondition:/i,
    ];
    const isNoise = (s) => NOISE.some(r => r.test(s));
    const urlsOf = (s) => s.match(/https?:\/\/\S+/g) || [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();
        if (lower.startsWith("click path:")) {
            clickPaths.push(...urlsOf(line));
            continue;
        }
        if (lower.startsWith("return shopper")) {
            dashboardLinks.push(...urlsOf(line));
            continue;
        }
        if (/^dashboard lead:/i.test(line)) {
            dashboardLinks.push(...urlsOf(line));
            continue;
        }
        if (lower.startsWith("preferred contact method:")) {
            preferred = (_a = line.split(":")[1]) === null || _a === void 0 ? void 0 : _a.trim();
            continue;
        }
        if (lower === "prefer text") {
            preferred = "text";
            continue;
        }
        if (/^optional questions/i.test(line))
            continue;
        if (/^question:/i.test(line)) {
            const q = line.replace(/^question:\s*/i, "").trim();
            let a = "—";
            let j = i + 1;
            while (j < lines.length && !/^question:/i.test(lines[j])) {
                const ln = lines[j];
                if (/^response:/i.test(ln))
                    a = ln.replace(/^response:\s*/i, "").replace(/^"|"$/g, "").trim() || "—";
                if (/^check:/i.test(ln)) {
                    const val = (_b = ln.split(":")[1]) === null || _b === void 0 ? void 0 : _b.trim();
                    if (val && val.toLowerCase() !== "no" && a === "—")
                        a = val;
                }
                j++;
            }
            qa.push({ question: q, answer: a });
            i = j - 1;
            continue;
        }
        if (/^vehicle prices\b/i.test(line)) {
            for (let k = i + 1; k < Math.min(lines.length, i + 6); k++) {
                const m = lines[k].match(/^\s*price:\s*([\d,]+(?:\.\d+)?)/i);
                if (m) {
                    const num = Number(m[1].replace(/,/g, ""));
                    if (!Number.isNaN(num))
                        priceFromBlob = num;
                    break;
                }
            }
            continue;
        }
        if (isNoise(line))
            continue;
    }
    const msgFromQA = normAns((_c = qa.find(q => MESSAGE_KEYS.test(q.question))) === null || _c === void 0 ? void 0 : _c.answer);
    const narrative = msgFromQA !== null && msgFromQA !== void 0 ? msgFromQA : (preferred === "text" ? "Prefer text" : undefined);
    return {
        narrative,
        clickPaths: uniq(clickPaths),
        dashboardLinks: uniq(dashboardLinks),
        qa,
        preferred,
        priceFromBlob,
    };
}
function normalizeDealerEProcess(xmlStr) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const doc = xml.parse(xmlStr);
    const prospect = (_b = (_a = doc === null || doc === void 0 ? void 0 : doc.adf) === null || _a === void 0 ? void 0 : _a.prospect) !== null && _b !== void 0 ? _b : {};
    const id = String((_c = prospect === null || prospect === void 0 ? void 0 : prospect.id) !== null && _c !== void 0 ? _c : "");
    const requestdate = prospect === null || prospect === void 0 ? void 0 : prospect.requestdate;
    const v = (_d = prospect === null || prospect === void 0 ? void 0 : prospect.vehicle) !== null && _d !== void 0 ? _d : {};
    const c = (_e = prospect === null || prospect === void 0 ? void 0 : prospect.customer) !== null && _e !== void 0 ? _e : {};
    const contact = (_f = c === null || c === void 0 ? void 0 : c.contact) !== null && _f !== void 0 ? _f : {};
    const { narrative, clickPaths, dashboardLinks, qa, preferred, priceFromBlob } = extractDEP(String((_g = c === null || c === void 0 ? void 0 : c.comments) !== null && _g !== void 0 ? _g : ""));
    const names = Array.isArray(contact === null || contact === void 0 ? void 0 : contact.name) ? contact.name : [contact === null || contact === void 0 ? void 0 : contact.name].filter(Boolean);
    const first = (_l = (_j = (_h = names === null || names === void 0 ? void 0 : names.find((n) => (n === null || n === void 0 ? void 0 : n.part) === "first")) === null || _h === void 0 ? void 0 : _h["#text"]) !== null && _j !== void 0 ? _j : (_k = contact === null || contact === void 0 ? void 0 : contact.name) === null || _k === void 0 ? void 0 : _k.first) !== null && _l !== void 0 ? _l : "";
    const last = (_q = (_o = (_m = names === null || names === void 0 ? void 0 : names.find((n) => (n === null || n === void 0 ? void 0 : n.part) === "last")) === null || _m === void 0 ? void 0 : _m["#text"]) !== null && _o !== void 0 ? _o : (_p = contact === null || contact === void 0 ? void 0 : contact.name) === null || _p === void 0 ? void 0 : _p.last) !== null && _q !== void 0 ? _q : "";
    const headline = [v === null || v === void 0 ? void 0 : v.year, v === null || v === void 0 ? void 0 : v.make, v === null || v === void 0 ? void 0 : v.model].filter(Boolean).join(" ");
    return {
        id,
        createdAt: requestdate !== null && requestdate !== void 0 ? requestdate : new Date().toISOString(),
        status: "new",
        customerName: `${first} ${last}`.trim() || "Unknown",
        email: (contact === null || contact === void 0 ? void 0 : contact.email) || undefined,
        phone: (contact === null || contact === void 0 ? void 0 : contact.phone) || undefined,
        preferredContactMethod: preferred,
        narrative,
        clickPathUrls: uniq([...clickPaths, ...dashboardLinks]),
        vehicleOfInterest: headline || undefined,
        vehicle: {
            year: (v === null || v === void 0 ? void 0 : v.year) ? Number(v.year) : undefined,
            make: (v === null || v === void 0 ? void 0 : v.make) || undefined,
            model: (v === null || v === void 0 ? void 0 : v.model) || undefined,
            trim: (v === null || v === void 0 ? void 0 : v.trim) || undefined,
            stock: (v === null || v === void 0 ? void 0 : v.stock) || undefined,
            vin: (v === null || v === void 0 ? void 0 : v.vin) || undefined,
            odometer: (v === null || v === void 0 ? void 0 : v.odometer) || undefined,
            price: (_s = ((_r = v === null || v === void 0 ? void 0 : v.price) !== null && _r !== void 0 ? _r : undefined)) !== null && _s !== void 0 ? _s : priceFromBlob,
        },
        previousToyotaCustomer: undefined,
        previousLexusCustomer: undefined,
        tradeIn: undefined,
        qa,
        cdkLeadId: id,
    };
}
/* =========================================================
   Lexus STAR <ProcessSalesLead>
   ========================================================= */
function extractXmlSegment(raw, root) {
    const m = raw.match(new RegExp(`<${root}[\\s\\S]*?<\\/${root}>`, "m"));
    return m ? m[0] : raw;
}
function mapPreferredContact(s) {
    const v = (s || "").toLowerCase();
    if (v.includes("email"))
        return "email";
    if (v.includes("phone") || v.includes("day phone") || v.includes("cell"))
        return "phone";
    if (v.includes("text"))
        return "text";
    return safe(s);
}
function sanitizeStarComments(s) {
    if (!s)
        return undefined;
    let t = s.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
    const DROP = [
        /ownership and service history not available/i,
        /unknown vehicle/i,
        /number of leads previously submitted/i,
    ];
    for (const r of DROP)
        t = t.replace(r, "").trim();
    t = t.replace(/^comments:\s*/i, "").trim();
    return t.length >= 3 ? t : undefined;
}
function extractStarTail(raw) {
    var _a, _b, _c, _d;
    const out = {};
    const parts = raw.split(/<\/ProcessSalesLead>/i);
    if (parts.length < 2)
        return out;
    const tail = parts[1];
    out.preferred = (_b = (_a = tail.match(/Preferred Contact:\s*(.+)/i)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.trim();
    out.comments = (_d = (_c = tail.match(/CUSTOMER COMMENT INFORMATION[\s\S]*?Comments:\s*([\s\S]*?)(?:\n{2,}|\r{2,}|$)/i)) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d.trim();
    return out;
}
function normalizeLexusSTAR(raw) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8;
    const xmlStr = extractXmlSegment(raw, "ProcessSalesLead");
    const doc = xml.parse(xmlStr);
    const area = (_a = doc === null || doc === void 0 ? void 0 : doc.ProcessSalesLead) === null || _a === void 0 ? void 0 : _a.ProcessSalesLeadDataArea;
    const hdr = (_b = area === null || area === void 0 ? void 0 : area.SalesLead) === null || _b === void 0 ? void 0 : _b.SalesLeadHeader;
    const veh = (_f = (_e = (_d = (_c = area === null || area === void 0 ? void 0 : area.SalesLead) === null || _c === void 0 ? void 0 : _c.SalesLeadDetail) === null || _d === void 0 ? void 0 : _d.SalesLeadLineItem) === null || _e === void 0 ? void 0 : _e.SalesLeadVehicleLineItem) === null || _f === void 0 ? void 0 : _f.SalesLeadVehicle;
    const given = (_j = (_h = (_g = hdr === null || hdr === void 0 ? void 0 : hdr.CustomerProspect) === null || _g === void 0 ? void 0 : _g.ProspectParty) === null || _h === void 0 ? void 0 : _h.SpecifiedPerson) === null || _j === void 0 ? void 0 : _j.GivenName;
    const family = (_m = (_l = (_k = hdr === null || hdr === void 0 ? void 0 : hdr.CustomerProspect) === null || _k === void 0 ? void 0 : _k.ProspectParty) === null || _l === void 0 ? void 0 : _l.SpecifiedPerson) === null || _m === void 0 ? void 0 : _m.FamilyName;
    const email = (_r = (_q = (_p = (_o = hdr === null || hdr === void 0 ? void 0 : hdr.CustomerProspect) === null || _o === void 0 ? void 0 : _o.ProspectParty) === null || _p === void 0 ? void 0 : _p.SpecifiedPerson) === null || _q === void 0 ? void 0 : _q.URICommunication) === null || _r === void 0 ? void 0 : _r.URIID;
    const phone = (_v = (_u = (_t = (_s = hdr === null || hdr === void 0 ? void 0 : hdr.CustomerProspect) === null || _s === void 0 ? void 0 : _s.ProspectParty) === null || _t === void 0 ? void 0 : _t.SpecifiedPerson) === null || _u === void 0 ? void 0 : _u.TelephoneCommunication) === null || _v === void 0 ? void 0 : _v.LocalNumber;
    const prefXml = (_y = (_x = (_w = hdr === null || hdr === void 0 ? void 0 : hdr.CustomerProspect) === null || _w === void 0 ? void 0 : _w.ProspectParty) === null || _x === void 0 ? void 0 : _x.SpecifiedPerson) === null || _y === void 0 ? void 0 : _y.ContactMethodTypeCode;
    const xmlNarr = sanitizeStarComments(hdr === null || hdr === void 0 ? void 0 : hdr.CustomerComments);
    const tail = extractStarTail(raw);
    const tailNarr = sanitizeStarComments(tail.comments);
    const narrative = (_z = tailNarr !== null && tailNarr !== void 0 ? tailNarr : xmlNarr) !== null && _z !== void 0 ? _z : undefined;
    const year = (veh === null || veh === void 0 ? void 0 : veh.ModelYear) ? Number(veh.ModelYear) : undefined;
    const make = (veh === null || veh === void 0 ? void 0 : veh.MakeString) || (veh === null || veh === void 0 ? void 0 : veh.ManufacturerName);
    const model = veh === null || veh === void 0 ? void 0 : veh.Model;
    const trim = veh === null || veh === void 0 ? void 0 : veh.TrimCode;
    const vin = veh === null || veh === void 0 ? void 0 : veh.VehicleID;
    const headline = [year, make, model, trim].filter(Boolean).join(" ");
    return {
        id: String((_2 = (_1 = (_0 = hdr === null || hdr === void 0 ? void 0 : hdr.DocumentIdentificationGroup) === null || _0 === void 0 ? void 0 : _0.DocumentIdentification) === null || _1 === void 0 ? void 0 : _1.DocumentID) !== null && _2 !== void 0 ? _2 : ""),
        createdAt: (hdr === null || hdr === void 0 ? void 0 : hdr.LeadCreationDateTime) || (hdr === null || hdr === void 0 ? void 0 : hdr.DocumentDateTime) || new Date().toISOString(),
        status: "new",
        customerName: `${(_3 = safe(given)) !== null && _3 !== void 0 ? _3 : ""} ${(_4 = safe(family)) !== null && _4 !== void 0 ? _4 : ""}`.trim() || "Unknown",
        email: safe(email),
        phone: safe(phone),
        preferredContactMethod: mapPreferredContact((_5 = tail.preferred) !== null && _5 !== void 0 ? _5 : prefXml),
        narrative,
        clickPathUrls: [],
        vehicleOfInterest: headline || undefined,
        vehicle: { year, make, model, trim, vin },
        previousToyotaCustomer: undefined,
        previousLexusCustomer: undefined,
        tradeIn: undefined,
        qa: [],
        cdkLeadId: String((_8 = (_7 = (_6 = hdr === null || hdr === void 0 ? void 0 : hdr.DocumentIdentificationGroup) === null || _6 === void 0 ? void 0 : _6.DocumentIdentification) === null || _7 === void 0 ? void 0 : _7.DocumentID) !== null && _8 !== void 0 ? _8 : ""),
    };
}
/* Auto-detect */
function normalizeAny(rawBody) {
    if (!rawBody)
        return null;
    if (rawBody.includes("<adf"))
        return normalizeDealerEProcess(rawBody);
    if (rawBody.includes("<ProcessSalesLead"))
        return normalizeLexusSTAR(rawBody);
    return null;
}
//# sourceMappingURL=adf.js.map