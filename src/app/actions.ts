
'use server';

import { generateAiSuggestionsForLead } from '@/ai/flows/generate-ai-suggestions-for-lead';
import type { GenerateAiSuggestionsForLeadInput } from '@/ai/flows/generate-ai-suggestions-for-lead';

type AddLeadInput = {
    customerName: string;
    vehicle: string;
    comments: string;
};

type ActionResponse = {
    success: boolean;
    message?: string;
};

export async function addLead(input: AddLeadInput): Promise<ActionResponse> {
  const url = process.env.GOOGLE_SCRIPT_URL;
  if (!url) {
    console.error('Google Script URL is not configured in .env');
    return { success: false, message: 'Server is not configured to handle this request.' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      // As Google Apps Script can sometimes be slow to respond, redirecting might cause issues.
      // It's better to handle the response directly.
      // redirect: 'follow', // This is not needed and can cause issues with CORS
    });

    const result = await response.json();

    if (result.status === 'success') {
      return { success: true };
    } else {
      return { success: false, message: result.message || 'The script reported an error.' };
    }
  } catch (error) {
    console.error('Error submitting lead to Google Sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown network error occurred.';
    return { success: false, message: `Failed to submit lead. ${errorMessage}` };
  }
}

export async function getAiSuggestion(input: GenerateAiSuggestionsForLeadInput): Promise<string> {
  try {
    const result = await generateAiSuggestionsForLead(input);
    return result.suggestion;
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    throw new Error('Failed to generate AI suggestion. Please try again.');
  }
}
