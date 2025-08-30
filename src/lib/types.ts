export type LeadStatus = 'new' | 'handled';

export type Lead = {
  id: string;
  customerName: string;
  vehicle: string;
  comments: string;
  status: LeadStatus;
  suggestion?: string;
  timestamp: number;
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
