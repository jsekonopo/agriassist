'use server';
/**
 * @fileOverview AI flow to advise on sustainable farming practices.
 *
 * - adviseSustainablePractices - A function that provides advice.
 * - AdviseSustainablePracticesInput - The input type for the function.
 * - AdviseSustainablePracticesOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AdviseSustainablePracticesInputSchema = z.object({
  cropTypes: z.string().describe('Comma-separated list of main crops grown (e.g., "Corn, Soybeans, Alfalfa").'),
  farmSizeAcres: z.number().optional().describe('Approximate size of the farm in acres.'),
  currentPractices: z.string().optional().describe('Brief description of current farming practices (e.g., "Conventional tillage, NPK fertilizers", "No-till for 5 years, uses cover crops").'),
  sustainabilityGoals: z.string().describe('Key sustainability goals for the farm (e.g., "Improve soil health", "Reduce water usage", "Enhance biodiversity", "Explore carbon credit potential").'),
  locationContext: z.string().optional().describe('General location or climate context if relevant (e.g., "Drought-prone area", "Heavy clay soil").'),
});
export type AdviseSustainablePracticesInput = z.infer<typeof AdviseSustainablePracticesInputSchema>;

const AdviseSustainablePracticesOutputSchema = z.object({
  recommendedPractices: z.string().describe('A list of 2-4 key recommended sustainable practices, each with a brief explanation of how it applies to the farm and its benefits towards the stated goals. Use Markdown for formatting if possible (e.g., bullet points).'),
  implementationTips: z.string().describe('Practical tips or starting points for implementing one or two of the top recommended practices.'),
  potentialCarbonCreditInfo: z.string().optional().describe('Brief information on how the suggested practices might relate to carbon credits, if applicable to the goals.'),
});
export type AdviseSustainablePracticesOutput = z.infer<typeof AdviseSustainablePracticesOutputSchema>;

export async function adviseSustainablePractices(input: AdviseSustainablePracticesInput): Promise<AdviseSustainablePracticesOutput> {
  return adviseSustainablePracticesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'adviseSustainablePracticesPrompt',
  input: {schema: AdviseSustainablePracticesInputSchema},
  output: {schema: AdviseSustainablePracticesOutputSchema},
  prompt: `You are an expert advisor in sustainable agriculture and regenerative farming practices.
A farmer is seeking advice based on the following farm details:

Main Crops: {{{cropTypes}}}
{{#if farmSizeAcres}}Farm Size: {{{farmSizeAcres}}} acres{{/if}}
{{#if currentPractices}}Current Practices: {{{currentPractices}}}{{/if}}
Sustainability Goals: {{{sustainabilityGoals}}}
{{#if locationContext}}Location/Climate Context: {{{locationContext}}}{{/if}}

Based on this information:
1.  Recommend 2-4 key sustainable practices relevant to their crops, goals, and context. For each practice, briefly explain its benefits and how it applies.
2.  Provide practical implementation tips for 1-2 of the top recommendations.
3.  If their goals mention carbon credits or it's highly relevant, briefly discuss how the suggested practices might contribute to carbon sequestration or credit opportunities.

Format your response according to the output schema. Use Markdown for lists if possible in the "recommendedPractices" field.
`,
});

const adviseSustainablePracticesFlow = ai.defineFlow(
  {
    name: 'adviseSustainablePracticesFlow',
    inputSchema: AdviseSustainablePracticesInputSchema,
    outputSchema: AdviseSustainablePracticesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
