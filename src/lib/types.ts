
export type LeadStatus = 'new' | 'handled';

// This type represents the new, detailed structure of a lead
// as processed by the upgraded Cloud Function.
export type Lead = {
  id: string; // The Firestore document ID
  status: LeadStatus;
  suggestion?: string;
  comments: string;
  timestamp: number;
  receivedAt: {
    seconds: number;
    nanoseconds: number;
  };
  customerName: string;
  vehicleName: string;
  
  meta: {
    adfId: string | null;
    requestDate: string | null;
    vendorName: string | null;
    providerName: string | null;
    providerUrl: string | null;
  };

  customer: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    zip: string | null;
    preferredContactMethod: string | null;
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
    doors: number | null;
    bodystyle: string | null;
    transmission: string | null;
    condition: string | null;
    priceFromCdata: number | null;
    _allParsedPairs: Record<string, string>;
  };
  
  validation: {
    hasEmailOrPhone: boolean;
    emailLooksValid: boolean | null;
    phoneDigits10: boolean | null;
    zipLooksValid: boolean | null;
  };
};
