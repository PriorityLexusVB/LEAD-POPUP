"use client";
import { Badge } from "@/components/ui/badge";

export function PrevOwnerBadges({ prevToyota, prevLexus }: { prevToyota?: boolean; prevLexus?: boolean }) {
  if (!prevToyota && !prevLexus) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {prevToyota && <Badge variant="secondary" className="bg-blue-600 text-white hover:bg-blue-600">Previous Toyota Customer</Badge>}
      {prevLexus &&  <Badge variant="secondary" className="bg-green-600 text-white hover:bg-green-600">Previous Lexus Customer</Badge>}
    </div>
  );
}
