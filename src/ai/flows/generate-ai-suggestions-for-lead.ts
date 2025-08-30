'use server';
/**
 * @fileOverview A flow to generate AI-powered reply suggestions for sales leads.
 *
 * - generateAiSuggestionsForLead - A function that generates AI reply suggestions for a given lead.
 * - GenerateAiSuggestionsForLeadInput - The input type for the generateAiSuggestionsForLead function.
 * - GenerateAiSuggestionsForLeadOutput - The return type for the generateAiSuggestionsForLead function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateAiSuggestionsForLeadInputSchema = z.object({
  customerName: z.string().describe('The name of the customer.'),
  vehicle: z.string().describe('The vehicle the customer is interested in.'),
  comments: z.string().describe('Additional comments or information about the lead.'),
});
export type GenerateAiSuggestionsForLeadInput = z.infer<typeof GenerateAiSuggestionsForLeadInputSchema>;

const GenerateAiSuggestionsForLeadOutputSchema = z.object({
  suggestion: z.string().describe('The AI-generated reply suggestion for the lead.'),
});
export type GenerateAiSuggestionsForLeadOutput = z.infer<typeof GenerateAiSuggestionsForLeadOutputSchema>;

export async function generateAiSuggestionsForLead(input: GenerateAiSuggestionsForLeadInput): Promise<GenerateAiSuggestionsForLeadOutput> {
  return generateAiSuggestionsForLeadFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAiSuggestionsForLeadPrompt',
  input: {schema: GenerateAiSuggestionsForLeadInputSchema},
  output: {schema: GenerateAiSuggestionsForLeadOutputSchema},
  prompt: `You are a sales expert. Generate a reply suggestion for a sales lead with the following information:\n\nCustomer Name: {{{customerName}}}\nVehicle: {{{vehicle}}}\nComments: {{{comments}}}\n\nSuggestion: `,
});

const generateAiSuggestionsForLeadFlow = ai.defineFlow(
  {
    name: 'generateAiSuggestionsForLeadFlow',
    inputSchema: GenerateAiSuggestionsForLeadInputSchema,
    outputSchema: GenerateAiSuggestionsForLeadOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
