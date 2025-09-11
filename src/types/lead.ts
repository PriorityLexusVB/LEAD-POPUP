export type LeadStatus = "new" | "handled";

export type QA = { question: string; answer: string };

export type VehicleDetails = {
  year?: number; make?: string; model?: string; trim?: string;
  stock?: string; vin?: string; odometer?: string | number; price?: string | number;
  exteriorColor?: string; interiorColor?: string;
};

export type TradeIn = {
  year?: number; make?: string; model?: string; trim?: string;
  vin?: string; mileage?: string | number;
};

export type Lead = {
  id: string;
  createdAt: string | number | Date;
  status: LeadStatus;

  customerName: string;

  // Contact
  email?: string;
  phone?: string;

  // Content & links
  narrative?: string;            // PURE customer comments/questions
  clickPathUrls?: string[];      // 0..n, deduped

  // Vehicle / history
  vehicleOfInterest?: string;    // “2015 Chrysler 200” (headline)
  vehicle?: VehicleDetails;
  previousToyotaCustomer?: boolean;
  previousLexusCustomer?: boolean;

  // Trade
  tradeIn?: TradeIn;

  // Form QA
  qa?: QA[];
  
  // Raw suggestion for the AI button
  suggestion?: string;

  // Deep link
  cdkUrl?: string;
  cdkLeadId?: string;
};
