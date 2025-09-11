
export type LeadStatus = "new" | "handled";

export type LeadQA = {
  question: string;
  answer: string;
};

export type TradeIn = {
  year?: number;
  make?: string;
  model?: string;
};

// This is the primary, flattened Lead object for UI use.
// It should be constructed from the raw Firestore payload.
export type Lead = {
  id: string;
  createdAt: string | number | Date; // ISO string or timestamp from 'receivedAt' or 'timestamp'
  status: LeadStatus;

  // Header
  customerName: string;
  vehicleOfInterest?: string;

  // Primary box
  email?: string;
  phone?: string;
  tradeIn?: TradeIn;
  campaignSource?: string; // e.g., "Google Ads"
  clickPathUrl?: string;   // full URL (we’ll display a shortened label)

  // Narrative (customer free-form comment only)
  narrative?: string;

  // Structured Q&A (from webforms etc.)
  qa?: LeadQA[];

  // CDK Integration
  cdkUrl?: string;     // full deep link if you have it
  cdkLeadId?: string;  // or just the lead id (we’ll build URL from env)

  // Raw suggestion for the AI button
  suggestion?: string;
};
