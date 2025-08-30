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
