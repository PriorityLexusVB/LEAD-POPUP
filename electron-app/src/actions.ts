
'use server';

import { generateAiSuggestionsForLead } from '@/ai/flows/generate-ai-suggestions-for-lead';
import type { GenerateAiSuggestionsForLeadInput } from '@/ai/flows/generate-ai-suggestions-for-lead';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export async function getAiSuggestion(input: GenerateAiSuggestionsForLeadInput): Promise<string> {
  try {
    const result = await generateAiSuggestionsForLead(input);
    return result.suggestion;
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    throw new Error('Failed to generate AI suggestion. Please try again.');
  }
}

export async function setLeadStatus(id: string, status: 'new' | 'handled') {
    try {
        const leadRef = doc(db, 'leads_v2', id);
        await updateDoc(leadRef, { status });
    } catch (e) {
        console.error("Failed to update lead status: ", e);
        throw new Error("Failed to update lead status.");
    }
}
