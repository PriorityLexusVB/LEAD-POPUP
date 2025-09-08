export type LeadStatus = 'new' | 'handled';

// This is the fully structured, Zod-validated lead object.
// It exists inside the `lead` property of the top-level Firestore document.
export type StructuredLead = {
  status: LeadStatus;
  suggestion?: string;
  comments: string | null;
  timestamp: number;
  receivedAt: {
    seconds: number;
    nanoseconds: number;
  };
  customerName: string;
  vehicleName: string;

  meta: {
    adfId: string;
    requestDate: string | null;
    vendorName: string | null;
    providerName: string | null;
    providerUrl: string | null;
  };

  customer: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phoneDigits: string | null;
    phonePretty: string | null;
    zip: string | null;
    preferredContactMethod: 'email' | 'phone' | 'text' | null;
  };

  tradeIn: {
    status: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    odometer: number | null;
    comments: string | null;
  } | null;

  interest: {
    status: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    stock: string | null;
    bodystyle: string | null;
    transmission: string | null;
    price: number | null;
    odometer: number | null;
  } | null;
  
  marketing: {
    clickPathUrl: string | null;
    primaryCampaignSource: string | null;
    adwordsClickId: string | null;
    networkType: string | null;
    eventDatetimeUtc: string | null;
    country: string | null;
    utm?: {
      source?: string | null;
      medium?: string | null;
      campaign?: string | null;
      term?: string | null;
      content?: string | null;
    };
    doors: number | null;
    bodystyle: string | null;
    transmission: string | null;
    condition: string | null;
    _allParsedPairs?: Record<string, string>;
  };
  
  optionalQuestions?: {
      question: string;
      check?: string;
      response?: string | null;
  }[];

  validation: {
    hasEmailOrPhone: boolean;
    emailLooksValid: boolean | null;
    phoneDigits10: boolean | null;
    zipLooksValid: boolean | null;
  };
};


// This is the top-level type for the document stored in Firestore.
// It includes the flattened fields for easy UI display, plus the full structured lead.
export type Lead = {
  id: string; // The Firestore document ID
  status: LeadStatus;
  suggestion?: string;
  comments: string | null;
  timestamp: number;
  receivedAt: {
    seconds: number;
    nanoseconds: number;
  };
  customerName: string;
  vehicleName: string;
  lead: StructuredLead; // The fully structured lead object
};
