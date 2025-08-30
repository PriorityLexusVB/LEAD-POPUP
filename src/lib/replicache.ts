
import {WriteTransaction} from 'replicache';
import {nanoid} from 'nanoid';
import type {ReadonlyJSONValue} from 'replicache';

export type Lead = {
  id: string;
  customerName: string;
  vehicle: string;
  comments: string;
  status: 'new' | 'handled';
  suggestion?: string;
  timestamp: number;
  sort: number;
};

export const mutators = {
  async createLead(tx: WriteTransaction, lead: Omit<Lead, 'sort'>) {
    const sort = (await tx.get<Lead>(`lead/${lead.id}`))?.sort ?? 0;
    await tx.put(`lead/${lead.id}`, {
      ...lead,
      sort,
    });
  },
  async updateLeadStatus(tx: WriteTransaction, {id, status}: {id: string; status: Lead['status']}) {
      const lead = await tx.get<Lead>(`lead/${id}`);
      if (lead) {
          await tx.put(`lead/${id}`, {...lead, status});
      }
  },
  async updateLeadSuggestion(tx: WriteTransaction, {id, suggestion}: {id: string; suggestion: string}) {
    const lead = await tx.get<Lead>(`lead/${id}`);
    if (lead) {
        await tx.put(`lead/${id}`, {...lead, suggestion});
    }
  }
};

export type M = typeof mutators;
