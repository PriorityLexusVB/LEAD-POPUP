
export type LeadStatus = 'new' | 'handled';

export type Lead = {
  id: string;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    preferredContact?: string | null;
    postalCode?: string | null;
  };
  vehicle: {
    year: string | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    price?: string | null;
    odometer?: string | null;
  };
  comments: string;
  status: LeadStatus;
  suggestion?: string;
  timestamp: number;
  receivedAt: {
    seconds: number;
    nanoseconds: number;
  };
  source: string;
  format: 'json' | 'adf' | 'raw';
  schedule?: {
    date: string | null;
    time: string | null;
  } | null;
  trade?: {
    url: string | null;
  } | null;
  campaign?: {
    source: string | null;
    campaignName: string | null;
    adGroup: string | null;
    keyword: string | null;
    clickId: string | null;
  } | null;
  links?: {
    clickPath: string | null;
    returnShopper: string | null;
    all: string[];
  } | null;
  questions?: {
    question: string;
    check: string | null;
    answer: string | null;
  }[];
};
