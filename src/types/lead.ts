
export type LeadStatus = "new" | "handled";

export type VehicleDetails = {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  stock?: string;
  vin?: string;
  price?: string | number;
  exteriorColor?: string;
  interiorColor?: string;
};

export type TradeIn = {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  mileage?: string | number;
};

// This is the primary, flattened Lead object for UI use.
// It should be constructed from the raw Firestore payload.
export type Lead = {
  id: string;
  createdAt: string | number | Date; // ISO string or timestamp from 'receivedAt' or 'timestamp'
  status: LeadStatus;

  // Header
  customerName: string;
  
  // message + ordering targets
  narrative?: string;

  // links (rendered as short labels)
  clickPathUrls?: string[];

  // vehicle / trade
  vehicleOfInterest?: string;    // simple headline (“2021 Toyota 4Runner”)
  vehicle?: VehicleDetails;      // structured details shown under the VOI section
  tradeIn?: TradeIn;

  // contact
  email?: string;
  phone?: string;
  
  // Raw suggestion for the AI button
  suggestion?: string;

  // CDK Integration
  cdkUrl?: string;     // full deep link if you have it
  cdkLeadId?: string;  // or just the lead id (we’ll build URL from env)
};
