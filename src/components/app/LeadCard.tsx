
'use client';

import { useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { getAiSuggestion } from '@/app/actions';
import { type Lead } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Check, Sparkles, Car, MessageSquare } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type LeadCardProps = {
  lead: Lead;
  onUpdate: (lead: Lead) => Promise<void>;
};

export default function LeadCard({ lead, onUpdate }: LeadCardProps) {
  const { toast } = useToast();
  const [isAiLoading, startAiTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<string | undefined>(lead.suggestion);
  const [isHandled, setIsHandled] = useState(lead.status === 'handled');

  const handleGenerateSuggestion = () => {
    startAiTransition(async () => {
      try {
        const result = await getAiSuggestion({
          customerName: lead.customerName,
          vehicle: lead.vehicle,
          comments: lead.comments,
        });
        setSuggestion(result);
        await onUpdate({ ...lead, suggestion: result });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'AI Suggestion Failed',
          description: error instanceof Error ? error.message : 'An unknown error occurred.',
          action: <AlertCircle />,
        });
      }
    });
  };
  
  const handleMarkAsHandled = async () => {
      setIsHandled(true);
      await onUpdate({...lead, status: 'handled'});
       toast({
          title: 'Lead Handled',
          description: `${lead.customerName}'s lead has been marked as handled.`,
        });
  }

  const timeAgo = formatDistanceToNow(new Date(lead.timestamp), { addSuffix: true });

  return (
    <Card className={cn('flex flex-col transition-all', isHandled && 'bg-card/50 opacity-70')}>
      <CardHeader>
        <div className="flex items-start justify-between">
            <CardTitle className="font-headline text-lg">{lead.customerName}</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={isHandled ? 'secondary' : 'outline'} className={cn(!isHandled && "border-primary/50 text-primary")}>
                    {isHandled ? 'Handled' : 'New'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{timeAgo}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
        </div>
        <CardDescription className="flex items-center gap-2 pt-1 text-sm">
          <Car className="h-4 w-4" /> <span>{lead.vehicle}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
            <MessageSquare className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">{lead.comments}</p>
        </div>

        {(isAiLoading || suggestion) && (
            <Accordion type="single" collapsible defaultValue={suggestion ? 'item-1' : undefined} className="w-full">
                <AccordionItem value="item-1">
                <AccordionTrigger className="text-sm font-semibold text-primary">
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
                    <p className="whitespace-pre-wrap text-sm text-foreground/80">{suggestion}</p>
                    )}
                </AccordionContent>
                </AccordionItem>
            </Accordion>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
        {!suggestion && !isHandled && (
          <Button onClick={handleGenerateSuggestion} disabled={isAiLoading} style={{backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))'}} className="w-full sm:w-auto">
            <Sparkles className="mr-2 h-4 w-4" />
            Suggest AI Reply
          </Button>
        )}
        {!isHandled && (
            <Button variant="outline" onClick={handleMarkAsHandled} className="w-full sm:w-auto">
                <Check className="mr-2 h-4 w-4" />
                Mark as Handled
            </Button>
        )}
      </CardFooter>
    </Card>
  );
}
