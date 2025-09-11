
"use client";

import { type Lead, type LeadStatus } from "@/types/lead";
import { relativeTimeWithExact, displayUrlLabel, compactTradeIn, buildCdkUrl } from "@/lib/format";
import { useTransition } from 'react';
import { useToast } from "@/hooks/use-toast";
import { getAiSuggestion } from "@/app/actions";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { Mail, Phone, CarFront, MessageSquareText, Link2, Clock, Sparkles, Check, AlertCircle, ExternalLink, Repeat } from "lucide-react";
import { IconTextRow } from "./IconTextRow";
import Link from "next/link";
import { Section } from "./Section";


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
  
  return (
    <Card className="shadow-sm border border-border/60">
      <CardHeader className="py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-6 truncate">{lead.customerName}</h3>
            {lead.vehicleOfInterest ? (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CarFront className="h-4 w-4" aria-hidden />
                <span className="truncate">{lead.vehicleOfInterest}</span>
              </div>
            ) : null}
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

      <CardContent className="pt-0 space-y-5">
        {/* ===== 1) Contact & Source (primary) ===== */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">Contact & Source</div>
            {(() => {
              const url = buildCdkUrl(lead);
              if (!url) return null;
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border/70 hover:bg-accent transition"
                >
                  Open in CDK <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              );
            })()}
          </div>

          {/* Minimal, actionable rows */}
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
        </div>

        {/* ===== 2) Message (prioritized details) ===== */}
        <Section title="Message">
          {/* a) Customer comments/questions FIRST */}
          {lead.narrative ? (
            <div className="text-sm text-muted-foreground leading-6 whitespace-pre-wrap">
              {lead.narrative}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">No message provided.</div>
          )}

          {/* b) Vehicle of Interest */}
          {lead.vehicleOfInterest && (
            <IconTextRow icon={<CarFront className="h-4 w-4" aria-hidden />}>
              <span>{lead.vehicleOfInterest}</span>
            </IconTextRow>
          )}

          {/* c) Trade-in */}
          {lead.tradeIn && compactTradeIn(lead.tradeIn) && (
            <IconTextRow icon={<Repeat className="h-4 w-4" aria-hidden />}>
              <span>Trade-In: {compactTradeIn(lead.tradeIn)}</span>
            </IconTextRow>
          )}

          {/* d) Minimal useful links (short labels) */}
          <div className="space-y-1 text-xs text-muted-foreground pt-2">
            {lead.clickPathUrl && (
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                <a href={lead.clickPathUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {displayUrlLabel(lead.clickPathUrl)}
                </a>
              </div>
            )}
            {lead.returnShopperUrl && (
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                <a href={lead.returnShopperUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {displayUrlLabel(lead.returnShopperUrl)}
                </a>
              </div>
            )}
          </div>
        </Section>

        {/* ===== 3) Form Details (only if present) ===== */}
        {lead.qa && lead.qa.length > 0 && (
          <Section title="Form Details">
            <div className="space-y-2">
              {lead.qa.map((row, idx) => (
                <div key={idx} className="rounded-lg border border-border/60 p-2.5">
                  <div className="text-xs font-semibold tracking-wide">{row.question}</div>
                  <div className="text-sm text-muted-foreground leading-6">{row.answer}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

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

        {/* ===== 4) Actions ===== */}
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
