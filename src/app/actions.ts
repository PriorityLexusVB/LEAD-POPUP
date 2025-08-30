'use server';

import { generateAiSuggestionsForLead } from '@/ai/flows/generate-ai-suggestions-for-lead';
import type { GenerateAiSuggestionsForLeadInput } from '@/ai/flows/generate-ai-suggestions-for-lead';

export async function getAiSuggestion(input: GenerateAiSuggestionsForLeadInput): Promise<string> {
  try {
    const result = await generateAiSuggestionsForLead(input);
    return result.suggestion;
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    throw new Error('Failed to generate AI suggestion. Please try again.');
  }
}
