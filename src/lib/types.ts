
export type LeadStatus = 'new' | 'handled';

export type Lead = {
  id: string;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  vehicle: {
    year: string | null;
    make: string | null;
    model: string | null;
    vin: string | null;
  };
  subject: string | null;
  comments: string; // Keep comments for internal use, map from subject
  status: LeadStatus;
  suggestion?: string;
  timestamp: number;
  receivedAt: {
    seconds: number;
    nanoseconds: number;
  };
  source: string;
  format: 'json' | 'adf';
};

export type RawLead = {
  raw: string;
  receivedAt: {
    seconds: number;
    nanoseconds: number;
  };
  source: string;
  headers: {
    contentType: string | null;
  }
}
