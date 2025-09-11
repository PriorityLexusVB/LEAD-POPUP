
import { format, formatDistanceToNow } from "date-fns";
import type { Lead, TradeIn } from "@/types/lead";

export function relativeTimeWithExact(dateLike: string | number | Date) {
  if (!dateLike) {
    return { relative: "some time ago", exact: "Unknown time" };
  }
  const date = typeof dateLike === "string" || typeof dateLike === "number" ? new Date(dateLike) : dateLike;
  try {
    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      exact: format(date, "PPpp"),
    };
  } catch {
    return { relative: "invalid date", exact: "Invalid Date" };
  }
}

export function displayUrlLabel(fullUrl?: string) {
  if (!fullUrl) return "";
  try {
    const u = new URL(fullUrl);
    const path = u.pathname === "/" ? "" : u.pathname;
    const shortPath = path.length > 24 ? path.slice(0, 21) + "…" : path;
    const host = u.host.replace(/^www\./, "");
    return `${host}${shortPath ? ` · ${shortPath}` : ""}`;
  } catch {
    return fullUrl; // fallback if it wasn’t a valid URL
  }
}

export function compactTradeIn(t?: TradeIn) {
  if (!t) return "";
  const bits = [t.year, t.make, t.model].filter(Boolean);
  return bits.join(" ");
}

export function buildCdkUrl(lead: { cdkUrl?: string; cdkLeadId?: string }) {
  if (lead.cdkUrl) return lead.cdkUrl;
  if (lead.cdkLeadId) {
    // set this to your real base in .env
    const base = process.env.NEXT_PUBLIC_CDK_BASE_URL?.replace(/\/+$/, "");
    if (base) return `${base}/evo2/fresh/leads/view.aspx?leadid=${encodeURIComponent(lead.cdkLeadId)}`;
  }
  return undefined;
}

export function nonEmpty<T>(arr?: (T | undefined | null)[]) {
  return (arr ?? []).filter(Boolean) as T[];
}
