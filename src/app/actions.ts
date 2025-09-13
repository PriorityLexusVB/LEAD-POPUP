'use server';

import type { GenerateAiSuggestionsForLeadInput } from '@/ai/flows/generate-ai-suggestions-for-lead';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';


export async function getAiSuggestion(input: GenerateAiSuggestionsForLeadInput): Promise<string> {
  try {
    // Lazy import inside the server action so it never touches the client bundle
    const { generateAiSuggestionsForLead } = await import('@/ai/flows/generate-ai-suggestions-for-lead');
    const result = await generateAiSuggestionsForLead(input);
    return result.suggestion;
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    throw new Error('Failed to generate AI suggestion. Please try again.');
  }
}

export async function setLeadStatus(id: string, status: 'new' | 'handled') {
    try {
        await adminDb.collection('leads_v2').doc(id).set({
            status,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (e) {
        console.error("Failed to update lead status: ", e);
        throw new Error("Failed to update lead status.");
    }
}
