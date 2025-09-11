
'use client';

import { useState, useTransition, useEffect } from 'react';
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
import { AlertCircle, Check, Sparkles, Car, MessageSquare, Mail, Phone, HelpCircle, Repeat, Link as LinkIcon, Megaphone } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

function InfoLine({ icon: Icon, label, value, href }: { icon: React.ElementType, label: string, value: string | null | undefined, href?: string }) {
    if (!value) return null;

    const content = href ? (
        <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">{value}</a>
    ) : (
        <span>{value}</span>
    );

    return (
        <div className="flex items-center gap-3 text-sm">
            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-grow truncate">
                <span className="font-medium">{label}:</span> <span className="truncate">{content}</span>
            </div>
        </div>
    );
}

export default function LeadCard({ lead, onUpdate }: { lead: Lead; onUpdate: (lead: Lead) => Promise<void>; }) {
  const { toast } = useToast();
  const [isAiLoading, startAiTransition] = useTransition();
  const [suggestion, setSuggestion] = useState<string | undefined>(lead.suggestion);
  const [isHandled, setIsHandled] = useState(lead.status === 'handled');
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    const timestamp = lead.timestamp;
    if (timestamp) {
      setTimeAgo(formatDistanceToNow(new Date(timestamp), { addSuffix: true }));
    }
  }, [lead.timestamp]);

  const vehicleName = lead.vehicleName || "Not specified";
  const customerName = lead.customerName || "Valued Customer";
  
  // Use the specific customer comments from the nested lead object, not the raw text block
  const customerComments = lead.lead.comments || "No comments provided.";
  
  const { customer, tradeIn, optionalQuestions, marketing } = lead.lead;
  
  const shortenUrl = (url: string | null | undefined, maxLength = 30) => {
    if (!url) return null;
    if (url.length <= maxLength) return url;
    return `${url.substring(0, maxLength)}...`;
  };


  const handleGenerateSuggestion = () => {
    startAiTransition(async () => {
      try {
        const result = await getAiSuggestion({
          customerName: customerName,
          vehicle: vehicleName,
          comments: customerComments,
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
          description: `${customerName}'s lead has been marked as handled.`,
        });
  }

  return (
    <Card className={cn('flex flex-col transition-all text-sm', isHandled && 'bg-card/50 opacity-70')}>
      <CardHeader className="p-4">
        <div className="flex items-start justify-between">
            <CardTitle className="font-headline text-base">{customerName}</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={isHandled ? 'secondary' : 'default'} className={cn(isHandled ? '' : 'bg-primary')}>
                    {isHandled ? 'Handled' : 'New'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{timeAgo || '...'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
        </div>
        <CardDescription className="flex items-center gap-2 pt-1 text-xs">
          <Car className="h-4 w-4" /> <span>Interested in: {vehicleName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-3 p-4 pt-0">
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
             <InfoLine icon={Mail} label="Email" value={customer.email} href={`mailto:${customer.email}`} />
             <InfoLine icon={Phone} label="Phone" value={customer.phonePretty} href={`tel:${customer.phoneDigits}`} />
             {tradeIn && (
                 <InfoLine icon={Repeat} label="Trade-In" value={`${tradeIn.year || ''} ${tradeIn.make || ''} ${tradeIn.model || ''}`.trim()} />
             )}
             <InfoLine icon={Megaphone} label="Campaign" value={marketing.primaryCampaignSource} />
             <InfoLine icon={LinkIcon} label="Click Path" value={shortenUrl(marketing.clickPathUrl)} href={marketing.clickPathUrl || undefined} />
        </div>

        {customerComments && customerComments !== 'No comments provided.' && (
          <div className="flex items-start gap-3 text-sm">
              <MessageSquare className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">{customerComments}</p>
          </div>
        )}
        
        {optionalQuestions && optionalQuestions.length > 0 && (
             <div className="space-y-2 pt-2">
                {optionalQuestions.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                        <HelpCircle className="mt-1 h-4 w-4 flex-shrink-0 text-accent" />
                        <div>
                            <p className="font-semibold text-foreground">{q.question}</p>
                            <p className="text-muted-foreground">{q.response || q.check}</p>
                        </div>
                    </div>
                ))}
             </div>
        )}

        {(isAiLoading || suggestion) && (
            <Accordion type="single" collapsible defaultValue={suggestion ? 'item-1' : undefined} className="w-full">
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
                    <p className="whitespace-pre-wrap text-xs text-foreground/80">{suggestion}</p>
                    )}
                </AccordionContent>
                </AccordionItem>
            </Accordion>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 p-4 pt-2 sm:flex-row sm:justify-end">
        {!suggestion && !isHandled && (
          <Button onClick={handleGenerateSuggestion} disabled={isAiLoading} size="sm" className="w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto">
            <Sparkles className="mr-2 h-4 w-4" />
            Suggest AI Reply
          </Button>
        )}
        {!isHandled && (
            <Button variant="outline" size="sm" onClick={handleMarkAsHandled} className="w-full sm:w-auto">
                <Check className="mr-2 h-4 w-4" />
                Mark as Handled
            </Button>
        )}
      </CardFooter>
    </Card>
  );
}
