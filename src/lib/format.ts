import { format, formatDistanceToNow } from "date-fns";

export function relativeTimeWithExact(dateLike: string | number | Date) {
  const d = new Date(dateLike);
  return { relative: formatDistanceToNow(d, { addSuffix: true }), exact: format(d, "PPpp") };
}

export function displayUrlLabel(fullUrl?: string) {
  if (!fullUrl) return "";
  try {
    const u = new URL(fullUrl.startsWith("http") ? fullUrl : `https://${fullUrl}`);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;
    const short = path.length > 24 ? path.slice(0, 21) + "…" : path;
    return `${host}${short ? ` · ${short}` : ""}`;
  } catch { return fullUrl; }
}

export function compactTradeIn(t?: { year?: number; make?: string; model?: string }) {
  if (!t) return "";
  return [t.year, t.make, t.model].filter(Boolean).join(" ");
}

export function nonEmpty<T>(arr?: (T|null|undefined)[]) {
  return (arr ?? []).filter(Boolean) as T[];
}

export function buildCdkUrl(lead: { cdkUrl?: string; cdkLeadId?: string }) {
  if (lead.cdkUrl) return lead.cdkUrl;
  if (lead.cdkLeadId) {
    const base = (process.env.NEXT_PUBLIC_CDK_BASE_URL ?? "https://cdk.eleadcrm.com").replace(/\/+$/, "");
    return `${base}/evo2/fresh/leads/view.aspx?leadid=${encodeURIComponent(lead.cdkLeadId)}`;
  }
}
