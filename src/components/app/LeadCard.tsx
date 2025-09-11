"use client";

import { type Lead } from "@/types/lead";
import { relativeTimeWithExact, displayUrlLabel, compactTradeIn, buildCdkUrl, nonEmpty } from "@/lib/format";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTransition } from 'react';
import { getAiSuggestion } from "@/app/actions";
import { Section } from "./Section";
import { IconTextRow } from "./IconTextRow";
import { PrevOwnerBadges } from "./PrevOwnerBadges";

import { Mail, Phone, CarFront, Link2, Clock, Sparkles, Check, AlertCircle, ExternalLink } from "lucide-react";
import { type LeadStatus } from "@/types/lead";


type Props = {
  lead: Lead;
  onUpdate: (id: string, updates: { status?: LeadStatus; suggestion?: string }) => Promise<void>;
};

export default function LeadCard({ lead, onUpdate }: Props) {
  const { toast } = useToast();
  const [isAiLoading, startAiTransition] = useTransition();

  const { relative, exact } = relativeTimeWithExact(lead.createdAt);

  const handleSuggestReply = () => {
    startAiTransition(async () => {
      try {
        const suggestion = await getAiSuggestion({
            customerName: lead.customerName,
            vehicle: lead.vehicleOfInterest || "vehicle",
            comments: lead.narrative || "No comments provided",
        });
        await onUpdate(lead.id, { suggestion });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'AI Suggestion Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred.',
          action: <AlertCircle />,
        });
      }
    });
  }

  const handleMarkHandled = () => {
    onUpdate(lead.id, { status: 'handled' });
    toast({
        title: 'Lead Handled',
        description: `${lead.customerName}'s lead has been marked as handled.`,
    });
  }

  const showVehicleSummaryTop =
  Boolean(lead.vehicleOfInterest || lead.vehicle);

  const hasVehicleDetailFields = Boolean(
    lead.vehicle &&
    (lead.vehicle.price ||
    lead.vehicle.odometer ||
    lead.vehicle.stock ||
    lead.vehicle.vin ||
    lead.vehicle.exteriorColor ||
    lead.vehicle.interiorColor)
  );
  
  return (
    <Card className="shadow-sm border border-border/60">
      <CardHeader className="py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 truncate">{lead.customerName}</h3>
            {lead.vehicleOfInterest && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CarFront className="h-4 w-4" aria-hidden />
                <span className="truncate">{lead.vehicleOfInterest}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={lead.status === "new" ? "default" : "secondary"} className="text-[11px] px-2 py-0.5">
              {lead.status === "new" ? "New" : "Handled"}
            </Badge>

            <TooltipProvider>
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default select-none">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    <span>{relative}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {exact}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-6">

        {/* Contact & Source with CDK button (kept concise) */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">Contact & Source</div>
            {(() => {
              const url = buildCdkUrl(lead);
              if (!url) return null;
              return (
                <a href={url} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border/70 hover:bg-accent transition">
                  Open in CDK <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              );
            })()}
          </div>
          
          {lead.preferredContactMethod && (
            <div className="text-xs">
              <Badge variant="outline" className="px-2 py-0.5">
                Preferred: {lead.preferredContactMethod[0].toUpperCase() + lead.preferredContactMethod.slice(1)}
              </Badge>
            </div>
          )}

          {lead.email && (
            <IconTextRow icon={<Mail className="h-4 w-4" aria-hidden />}>
              <a href={`mailto:${lead.email}`} className="underline underline-offset-2 break-all">{lead.email}</a>
            </IconTextRow>
          )}
          {lead.phone && (
            <IconTextRow icon={<Phone className="h-4 w-4" aria-hidden />}>
              <a href={`tel:${lead.phone}`} className="underline underline-offset-2">{lead.phone}</a>
            </IconTextRow>
          )}

          {/* Compact Vehicle Summary at the top (right under email/phone) */}
          {showVehicleSummaryTop && (
            <div className="pt-2 mt-2 border-t border-border/50 space-y-1.5">
              <IconTextRow icon={<CarFront className="h-4 w-4" aria-hidden />}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">
                    {lead.vehicleOfInterest ||
                      [lead.vehicle?.year, lead.vehicle?.make, lead.vehicle?.model, lead.vehicle?.trim]
                        .filter(Boolean).join(" ")}
                  </span>

                  {lead.vehicle?.price && (
                    <span className="text-xs text-muted-foreground">• Price: {lead.vehicle.price}</span>
                  )}
                  {lead.vehicle?.odometer && (
                    <span className="text-xs text-muted-foreground">• Odometer: {lead.vehicle.odometer}</span>
                  )}
                  {lead.vehicle?.stock && (
                    <span className="text-xs text-muted-foreground">• Stock: {lead.vehicle.stock}</span>
                  )}
                </div>
              </IconTextRow>

              {/* Previous Toyota/Lexus badges right under headline */}
              <PrevOwnerBadges
                prevToyota={lead.previousToyotaCustomer}
                prevLexus={lead.previousLexusCustomer}
              />
            </div>
          )}
        </div>

        {/* 1) COMMENTS / QUESTIONS (first) */}
        <Section title="Comments / Questions">
          {lead.narrative
            ? <div className="text-sm text-muted-foreground leading-6 whitespace-pre-wrap">{lead.narrative}</div>
            : <div className="text-sm text-muted-foreground italic">No message provided.</div>}
        </Section>

        {/* 2) CLICK PATH (short links; supports two or more) */}
        {nonEmpty(lead.clickPathUrls)?.length ? (
          <Section title="Click Path">
            <div className="space-y-1 text-xs text-muted-foreground">
              {nonEmpty(lead.clickPathUrls).map((u, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                  <a href={u} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {displayUrlLabel(u)}
                  </a>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {/* 3) Vehicle of Interest (details only if summary was shown above) */}
        {(showVehicleSummaryTop && hasVehicleDetailFields) || (!showVehicleSummaryTop && (lead.vehicleOfInterest || hasVehicleDetailFields)) ? (
          <Section title="Vehicle of Interest">
            {/* If we didn't show the summary above, show the headline here */}
            {!showVehicleSummaryTop && lead.vehicleOfInterest && (
              <div className="text-sm font-medium">{lead.vehicleOfInterest}</div>
            )}

            {/* Details grid (only extra fields; headline already shown up top) */}
            {lead.vehicle && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground mt-2">
                {!showVehicleSummaryTop && (lead.vehicle.year || lead.vehicle.make || lead.vehicle.model) ? (
                  <div><span className="font-medium text-foreground">Model:</span> {[
                    lead.vehicle.year, lead.vehicle.make, lead.vehicle.model, lead.vehicle.trim
                  ].filter(Boolean).join(" ")}</div>
                ) : null}

                {/* These are “extra” fields even when the summary is shown */}
                {lead.vehicle.price && <div><span className="font-medium text-foreground">Price:</span> {lead.vehicle.price}</div>}
                {lead.vehicle.odometer && <div><span className="font-medium text-foreground">Odometer:</span> {lead.vehicle.odometer}</div>}
                {lead.vehicle.stock && <div><span className="font-medium text-foreground">Stock #:</span> {lead.vehicle.stock}</div>}
                {lead.vehicle.vin && <div><span className="font-medium text-foreground">VIN:</span> {lead.vehicle.vin}</div>}
                {lead.vehicle.exteriorColor && <div><span className="font-medium text-foreground">Ext. Color:</span> {lead.vehicle.exteriorColor}</div>}
                {lead.vehicle.interiorColor && <div><span className="font-medium text-foreground">Int. Color:</span> {lead.vehicle.interiorColor}</div>}
              </div>
            )}
          </Section>
        ) : null}

        {/* 4) TRADE (if present) */}
        {lead.tradeIn && (
          <Section title="Trade">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div><span className="font-medium text-foreground">Vehicle:</span> {compactTradeIn(lead.tradeIn)}</div>
              {lead.tradeIn.trim ? (<div><span className="font-medium text-foreground">Trim:</span> {lead.tradeIn.trim}</div>) : null}
              {lead.tradeIn.vin ? (<div><span className="font-medium text-foreground">VIN:</span> {lead.tradeIn.vin}</div>) : null}
              {lead.tradeIn.mileage ? (<div><span className="font-medium text-foreground">Mileage:</span> {lead.tradeIn.mileage}</div>) : null}
            </div>
          </Section>
        )}

         {/* 5) Form Details (QA) */}
         {lead.qa?.length ? (
          <Section title="Form Details">
            <div className="space-y-2">
              {lead.qa.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-border/60 p-2.5">
                  <div className="text-xs font-semibold">{row.question}</div>
                  <div className="text-sm text-muted-foreground leading-6">{row.answer}</div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}
        
        {/* AI Suggestion */}
        {(isAiLoading || lead.suggestion) && (
            <Accordion type="single" collapsible defaultValue={lead.suggestion ? 'item-1' : undefined} className="w-full">
                <AccordionItem value="item-1">
                <AccordionTrigger className="text-xs font-semibold text-primary">
                    AI Reply Suggestion
                </AccordionTrigger>
                <AccordionContent>
                    {isAiLoading ? (
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
            {!lead.suggestion && lead.status === 'new' && (
            <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleSuggestReply}
                disabled={isAiLoading}
            >
                <Sparkles className="mr-2 h-4 w-4" />
                Suggest AI Reply
            </Button>
            )}
            {lead.status === 'new' && (
            <Button
                size="sm"
                className="h-8"
                onClick={handleMarkHandled}
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
