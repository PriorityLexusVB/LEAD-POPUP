"use client";
import { useState } from "react";
import LeadCard from "./LeadCard";
import type { Lead } from "@/types/lead";
import { getAiSuggestion, setLeadStatus } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";

export default function LeadList({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const { toast } = useToast();

  const handleSuggestReply = async (lead: Lead) => {
    try {
      const suggestion = await getAiSuggestion({
        customerName: lead.customerName,
        vehicle: lead.vehicleOfInterest || '',
        comments: lead.narrative || '',
      });
      setLeads(prevLeads =>
        prevLeads.map(l => (l.id === lead.id ? { ...l, suggestion } : l))
      );
    } catch (error) {
      console.error("Failed to get AI suggestion:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not generate AI suggestion. Please try again.",
      });
    }
  };

  const handleMarkHandled = async (id: string) => {
    try {
      await setLeadStatus(id, 'handled');
      setLeads(prevLeads =>
        prevLeads.map(l => (l.id === id ? { ...l, status: 'handled' } : l))
      );
    } catch (error) {
      console.error("Failed to mark as handled:", error);
       toast({
        variant: "destructive",
        title: "Error",
        description: "Could not update lead status. Please try again.",
      });
    }
  };

  if (!leads || leads.length === 0) {
    return (
      <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground">No leads found.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-3">
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onSuggestReply={handleSuggestReply}
            onMarkHandled={handleMarkHandled}
          />
        ))}
      </div>
    </div>
  );
}
