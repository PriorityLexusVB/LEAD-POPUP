"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyLeadSource = classifyLeadSource;
const N = (s) => (s || "").toLowerCase();
const key = (s) => { const k = N(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); return k || undefined; };
const any = (res, s) => res.some(r => r.test(s || ""));
function classifyLeadSource(base, ctx) {
    const subject = N(ctx.subject);
    const from = N(ctx.fromAddr);
    const text = N(ctx.rawText);
    const prov = N([ctx.providerName, ctx.providerService, ctx.providerUrl].filter(Boolean).join(" "));
    const star = N([ctx.starSenderName, ctx.starCreator].filter(Boolean).join(" "));
    const withTag = (vendor, subSource, channel) => (Object.assign(Object.assign({}, base), { vendor, subSource, channel }));
    const matchOne = (hay, pairs) => {
        const s = hay.toLowerCase();
        for (const [needle, value] of pairs)
            if (s.includes(needle))
                return value;
        return undefined;
    };
    // ----- Dealer e-Process (Dealer Site) -----
    if (prov.includes("dealer e-process") || prov.includes("prioritylexusvirginiabeach.com") || subject.includes("dealer e process") || subject.includes("dealer e-process")) {
        const sub = matchOne(prov + " " + subject, [
            ["confirm availability", "confirm_availability"],
            ["contact us", "contact_us"],
            ["credit confirm", "credit_confirm"],
            ["eauto appraise", "eauto_appraise"],
            ["get e-price", "get_e_price"],
            ["price drop", "price_drop"],
            ["schedule test drive", "schedule_test_drive"],
            ["payment explorer", "payment_explorer"],
            ["reveal", "reveal"],
            ["trade-in", "trade_in"],
            ["no sub-source", "no_sub_source"],
            ["all for source", "all_for_source"],
        ]) || key(ctx.providerService) || key(ctx.providerName) || "website_form";
        return withTag("dealer_eprocess", sub, "web");
    }
    // ----- AutoAPR -----
    if (prov.includes("autoapr") || subject.includes("autoapr") || from.includes("@autoapr")) {
        const sub = matchOne(prov + " " + subject, [
            ["payment explorer", "payment_explorer"],
            ["reveal", "reveal"],
            ["all for source", "all_for_source"],
        ]) || "all_for_source";
        return withTag("autoapr", sub, "web");
    }
    // ----- Autotrader -----
    if (prov.includes("autotrader") || subject.includes("autotrader") || from.includes("@autotrader")) {
        const sub = (prov.includes("wallet") || subject.includes("wallet")) ? "wallet_lead" : "all_for_source";
        return withTag("autotrader", sub, "web");
    }
    // ----- CARFAX -----
    if (prov.includes("carfax") || subject.includes("carfax") || from.includes("@carfax") || from.includes("@autotrader.com")) {
        const sub = matchOne(prov + " " + subject, [
            ["car listings", "carfax_car_listings"],
            ["trade-in lead", "trade_in_lead"],
            ["all for source", "all_for_source"],
        ]) || "all_for_source";
        return withTag("carfax", sub, "web");
    }
    // ----- CarGurus -----
    if (prov.includes("cargurus") || subject.includes("cargurus") || from.includes("@cargurus")) {
        return withTag("cargurus", "no_sub_source", "web");
    }
    // ----- Cars.com -----
    if (prov.includes("cars.com") || subject.includes("cars.com") || from.includes("@cars.com")) {
        return withTag("cars_com", "cars_com_leads", "web");
    }
    // ----- Lexus.com (STAR) -----
    if (star.includes("lexus") || prov.includes("lexus.com") || subject.includes("lexus.com")) {
        const sub = matchOne(subject + " " + prov + " " + text, [
            ["vcr mobile", "lexus_vcr_mobile_lead"],
            ["vcr website", "lexus_vcr_website_lead"],
            ["search inventory tool contact dealer", "lexus_contact_dealer"],
            ["search inventory tool find it for me", "lexus_find_it_for_me"],
            ["search inventory", "lexus_search_inventory"],
            ["all for source", "all_for_source"],
        ]) || "all_for_source";
        return withTag("lexus_com", sub, "web");
    }
    // ----- Gubagoo (Desktop/Mobile) -----
    if (subject.includes("gubagoo") || from.includes("gubagoo") || text.includes("chat lead") || text.includes("chat transcript")) {
        const sub = subject.includes("mobile") ? "mobile" : subject.includes("desktop") ? "desktop" : "chat";
        return withTag("gubagoo", sub, "chat");
    }
    // ----- RouteOne (Online Credit App) -----
    if (subject.includes("routeone") || from.includes("@routeone") || prov.includes("routeone") || text.includes("credit application") || text.includes("online credit app")) {
        return withTag("routeone", "digital_retail", "finance");
    }
    // ----- TradePending -----
    if (subject.includes("tradepending") || from.includes("@tradepending") || text.includes("tradepending") || prov.includes("tradepending")) {
        return withTag("tradepending", "website_market_data", "trade");
    }
    // ----- Website-OffLeaseFin/InsProdLFS -----
    if (subject.includes("off-lease") || prov.includes("off-lease financing") || text.includes("off-lease financing")) {
        return withTag("offlease_fin_insprod_lfs", "off_lease_financing_website", "finance");
    }
    // ----- “All Sources / All For Source” generic bucket -----
    if (subject.includes("all sources") || prov.includes("all for source")) {
        return withTag("all_sources", "all_for_source", "web");
    }
    // ----- Generic marketplace catch -----
    if (any([/cars\.com/, /autotrader/, /cargurus/, /carfax/], prov)) {
        return withTag(key(prov) || "marketplace", key(ctx.providerService) || "all_for_source", "web");
    }
    // ----- Catch-all -----
    return withTag("other", "other", "other");
}
//# sourceMappingURL=classify.js.map