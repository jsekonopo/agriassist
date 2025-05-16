// src/ai/flows/ai-farm-expert.ts
'use server';

/**
 * @fileOverview This file defines the AI Farm Expert flow, allowing farmers to ask simple 'how to' questions related to farming.
 *
 * - askAIFarmExpert - A function that takes a question as input and returns an answer from the AI Farm Expert.
 * - AskAIFarmExpertInput - The input type for the askAIFarmExpert function.
 * - AskAIFarmExpertOutput - The return type for the askAIFarmExpert function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AskAIFarmExpertInputSchema = z.object({
  question: z.string().describe('The question to ask the AI Farm Expert.'),
});
export type AskAIFarmExpertInput = z.infer<typeof AskAIFarmExpertInputSchema>;

const AskAIFarmExpertOutputSchema = z.object({
  answer: z.string().describe('The answer from the AI Farm Expert.'),
});
export type AskAIFarmExpertOutput = z.infer<typeof AskAIFarmExpertOutputSchema>;

export async function askAIFarmExpert(input: AskAIFarmExpertInput): Promise<AskAIFarmExpertOutput> {
  return askAIFarmExpertFlow(input);
}

const prompt = ai.definePrompt({
  name: 'askAIFarmExpertPrompt',
  input: {schema: AskAIFarmExpertInputSchema},
  output: {schema: AskAIFarmExpertOutputSchema},
  prompt: `You are an AI Farm Expert, providing simple and concise answers to farmers' questions about common farming tasks.

Question: {{{question}}}

Answer: `,
});

const askAIFarmExpertFlow = ai.defineFlow(
  {
    name: 'askAIFarmExpertFlow',
    inputSchema: AskAIFarmExpertInputSchema,
    outputSchema: AskAIFarmExpertOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
