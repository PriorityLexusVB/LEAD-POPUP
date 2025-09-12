"use client";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mail, Phone, CarFront, Link2, Clock, ExternalLink, Sparkles, Check } from "lucide-react";
import type { Lead } from "@/types/lead";
import { useTransition } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";

const rel = (d: string | number | Date) => ({ rel: formatDistanceToNow(new Date(d), { addSuffix: true }), exact: format(new Date(d), "PPpp") });
const labelUrl = (u?: string) => { if (!u) return ""; try { const x = new URL(u.startsWith("http")?u:`https://${u}`); const h = x.host.replace(/^www\./,""); const p = x.pathname==="/"?"":x.pathname; return `${h}${p.length>24?` · ${p.slice(0,21)}…`:(p?` · ${p}`:"")}`; } catch { return u||""; } };
const cleanNarr = (n?: string) => { if (!n) return undefined; const DROP = [/^click path\b/i,/^return shopper\b/i,/^dashboard lead\b/i,/^primary ppc campaign/i,/^secondary ppc campaign/i,/^source\s*:/i,/^price\s*:/i,/^vehicle prices\b/i,/^lexus (dealercode|sourceid)\b/i,/^expires\b/i,/^network type\b/i,/https?:\/\/\S+/i]; const ok=n.split(/\r?\n/).map(s=>s.replace(/\u00A0/g," ").trim()).filter(s=>s&& !DROP.some(r=>r.test(s))); return ok.join("\n")||undefined; };
const nonEmpty = <T,>(a?: (T|null|undefined)[]) => (a??[]).filter(Boolean) as T[];
const compactTrade = (t?: {year?:number;make?:string;model?:string}) => t?[t.year,t.make,t.model].filter(Boolean).join(" "):"";
const cdk = (lead: Lead) => lead.cdkUrl || (lead.cdkLeadId ? `${process.env.NEXT_PUBLIC_CDK_BASE_URL || "https://cdk.eleadcrm.com"}/evo2/fresh/leads/view.aspx?leadid=${encodeURIComponent(lead.cdkLeadId)}` : undefined);

function Row({ icon, children}:{icon:React.ReactNode;children:React.ReactNode}){return <div className="flex items-start gap-2 text-sm leading-5"><span className="mt-0.5">{icon}</span><div className="min-w-0 break-words">{children}</div></div>;}
function Section({ title, children}:{title:string;children:React.ReactNode}){return <div className="space-y-2"><div className="text-sm font-medium">{title}</div><div className="space-y-2">{children}</div></div>;}

export default function LeadCard({ lead, onSuggestReply, onMarkHandled }:{
  lead: Lead; onSuggestReply?: (l:Lead)=>void; onMarkHandled?: (id:string)=>void;
}) {
  const { rel: since, exact } = rel(lead.createdAt);
  const narr = cleanNarr(lead.narrative);
  const showTopVOI = Boolean(lead.vehicleOfInterest || lead.vehicle);
  const hasVOIDetails = Boolean(lead.vehicle && (lead.vehicle.price || lead.vehicle.odometer || lead.vehicle.stock || lead.vehicle.vin || lead.vehicle.exteriorColor || lead.vehicle.interiorColor));
  const [isAiLoading, startAiTransition] = useTransition();

  const handleSuggest = () => {
    startAiTransition(() => {
        if (onSuggestReply) {
            onSuggestReply(lead);
        }
    });
  }

  return (
    <Card className="shadow-sm border border-border/60">
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 truncate">{lead.customerName}</h3>
            {lead.vehicleOfInterest && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CarFront className="h-4 w-4" /><span className="truncate">{lead.vehicleOfInterest}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lead.vendor && <Badge variant="outline" className="text-[11px] capitalize">{lead.vendor.replace(/_/g," ")}</Badge>}
            <Badge variant={lead.status==="new"?"default":"secondary"} className="text-[11px] px-2 py-0.5">{lead.status==="new"?"New":"Handled"}</Badge>
            <TooltipProvider><Tooltip delayDuration={150}><TooltipTrigger asChild><div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default"><Clock className="h-3.5 w-3.5"/><span>{since}</span></div></TooltipTrigger><TooltipContent className="text-xs">{exact}</TooltipContent></Tooltip></TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-6">
        {/* Contact & Source */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">Contact & Source</div>
            {(() => { const url = cdk(lead); return url ? (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border/70 hover:bg-accent transition">
                Open in CDK <ExternalLink className="h-3.5 w-3.5"/>
              </a>) : null; })()}
          </div>

          {lead.preferredContactMethod && (
            <div className="text-xs"><Badge variant="outline" className="px-2 py-0.5 capitalize">Preferred: {lead.preferredContactMethod}</Badge></div>
          )}

          {lead.email && <Row icon={<Mail className="h-4 w-4" />}><a href={`mailto:${lead.email}`} className="underline underline-offset-2 break-all">{lead.email}</a></Row>}
          {lead.phone && <Row icon={<Phone className="h-4 w-4" />}><a href={`tel:${lead.phone}`} className="underline underline-offset-2">{lead.phone}</a></Row>}

          {/* Vehicle summary right under contact */}
          {showTopVOI && (
            <div className="pt-2 mt-2 border-t border-border/50 space-y-1.5">
              <Row icon={<CarFront className="h-4 w-4" />}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">
                    {lead.vehicleOfInterest || [lead.vehicle?.year, lead.vehicle?.make, lead.vehicle?.model, lead.vehicle?.trim].filter(Boolean).join(" ")}
                  </span>
                  {lead.vehicle?.price && <span className="text-xs text-muted-foreground">• Price: {lead.vehicle.price}</span>}
                  {lead.vehicle?.odometer && <span className="text-xs text-muted-foreground">• Odometer: {lead.vehicle.odometer}</span>}
                  {lead.vehicle?.stock && <span className="text-xs text-muted-foreground">• Stock: {lead.vehicle.stock}</span>}
                </div>
              </Row>

              <div className="flex flex-wrap gap-2">
                {lead.previousToyotaCustomer && <Badge variant="secondary" className="bg-blue-600 text-white hover:bg-blue-600">Previous Toyota Customer</Badge>}
                {lead.previousLexusCustomer  && <Badge variant="secondary" className="bg-green-600 text-white hover:bg-green-600">Previous Lexus Customer</Badge>}
              </div>
            </div>
          )}
        </div>

        {/* 1) Comments / Questions */}
        {narr && (
          <Section title="Comments / Questions">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{narr}</p>
          </Section>
        )}

        {/* 2) Click Path */}
        {nonEmpty(lead.clickPathUrls).length ? (
          <Section title="Click Path">
            <div className="space-y-1 text-xs text-muted-foreground">
              {nonEmpty(lead.clickPathUrls).map((u,i)=>(
                <div key={i} className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5"/><a href={u} target="_blank" rel="noreferrer" className="underline underline-offset-2">{labelUrl(u)}</a>
                </div>
              ))}
            </div>
          </Section>
        ):null}

        {/* 3) Vehicle of Interest (details only) */}
        {((showTopVOI && hasVOIDetails) || (!showTopVOI && (lead.vehicleOfInterest || hasVOIDetails))) && (
          <Section title="Vehicle of Interest">
            {!showTopVOI && lead.vehicleOfInterest && <div className="text-sm font-medium">{lead.vehicleOfInterest}</div>}
            {lead.vehicle && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground mt-2">
                {!showTopVOI && (lead.vehicle.year || lead.vehicle.make || lead.vehicle.model) && (
                  <div><span className="font-medium text-foreground">Model:</span> {[lead.vehicle.year,lead.vehicle.make,lead.vehicle.model,lead.vehicle.trim].filter(Boolean).join(" ")}</div>
                )}
                {lead.vehicle.price && !showTopVOI && <div><span className="font-medium text-foreground">Price:</span> {lead.vehicle.price}</div>}
                {lead.vehicle.odometer && !showTopVOI && <div><span className="font-medium text-foreground">Odometer:</span> {lead.vehicle.odometer}</div>}
                {lead.vehicle.stock && !showTopVOI && <div><span className="font-medium text-foreground">Stock #:</span> {lead.vehicle.stock}</div>}
                {lead.vehicle.vin && <div><span className="font-medium text-foreground">VIN:</span> {lead.vehicle.vin}</div>}
                {lead.vehicle.exteriorColor && <div><span className="font-medium text-foreground">Ext. Color:</span> {lead.vehicle.exteriorColor}</div>}
                {lead.vehicle.interiorColor && <div><span className="font-medium text-foreground">Int. Color:</span> {lead.vehicle.interiorColor}</div>}
              </div>
            )}
          </Section>
        )}

        {/* 4) Trade */}
        {lead.tradeIn && (
          <Section title="Trade">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div><span className="font-medium text-foreground">Vehicle:</span> {compactTrade(lead.tradeIn)}</div>
              {lead.tradeIn.trim && <div><span className="font-medium text-foreground">Trim:</span> {lead.tradeIn.trim}</div>}
              {lead.tradeIn.vin && <div><span className="font-medium text-foreground">VIN:</span> {lead.tradeIn.vin}</div>}
              {lead.tradeIn.mileage && <div><span className="font-medium text-foreground">Mileage:</span> {lead.tradeIn.mileage}</div>}
            </div>
          </Section>
        )}

        {/* 5) Form Details */}
        {lead.qa?.length ? (
          <Section title="Form Details">
            <div className="space-y-2">
              {lead.qa.map((row,idx)=>(
                <div key={idx} className="rounded-lg border border-border/60 p-2.5">
                  <div className="text-xs font-semibold">{row.question}</div>
                  <div className="text-sm text-muted-foreground leading-6">{row.answer}</div>
                </div>
              ))}
            </div>
          </Section>
        ):null}
        
        {/* AI Suggestion */}
        {(isAiLoading || lead.suggestion) && (
            <Accordion type="single" collapsible defaultValue={lead.suggestion ? 'item-1' : undefined} className="w-full">
                <AccordionItem value="item-1">
                <AccordionTrigger className="text-xs font-semibold text-primary">
                    AI Reply Suggestion
                </AccordionTrigger>
                <AccordionContent>
                    {isAiLoading && !lead.suggestion ? (
                    <div className="space-y-2 p-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[80%]" />
                        <Skeleton className="h-4 w-[90%]" />
                    </div>
                    ) : (
                    <p className="whitespace-pre-wrap text-xs text-foreground/80">{lead.suggestion}</p>
                    )}
                </AccordionContent>
                </AccordionItem>
            </Accordion>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
            {lead.status === 'new' && (
            <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleSuggest}
                disabled={isAiLoading}
            >
                <Sparkles className="mr-2 h-4 w-4" />
                {lead.suggestion ? 'Regenerate' : 'Suggest AI Reply'}
            </Button>
            )}
            {lead.status === 'new' && (
            <Button
                size="sm"
                className="h-8"
                onClick={() => onMarkHandled?.(lead.id)}
            >
                <Check className="mr-2 h-4 w-4" />
                Mark as Handled
            </Button>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
