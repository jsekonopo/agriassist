'use server';
/**
 * @fileOverview AI flow to suggest optimal planting or harvesting windows for a given crop and location.
 *
 * - suggestPlantingHarvestingWindows - A function that suggests windows.
 * - SuggestPlantingHarvestingWindowsInput - The input type for the function.
 * - SuggestPlantingHarvestingWindowsOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestPlantingHarvestingWindowsInputSchema = z.object({
  location: z.string().describe('The geographical location of the farm (e.g., "Ottawa, Ontario").'),
  cropType: z.string().describe('The specific crop for which advice is sought (e.g., "Corn", "Tomatoes").'),
  activity: z.enum(["Planting", "Harvesting"]).describe('Whether advice is needed for planting or harvesting.'),
  additionalNotes: z.string().optional().describe('Any additional details or constraints, like "looking for early harvest" or "using a frost-sensitive variety".'),
});
export type SuggestPlantingHarvestingWindowsInput = z.infer<typeof SuggestPlantingHarvestingWindowsInputSchema>;

const SuggestPlantingHarvestingWindowsOutputSchema = z.object({
  suggestedWindow: z.string().describe('A concise suggested timeframe (e.g., "Late April to Mid-May", "First two weeks of September").'),
  detailedAdvice: z.string().describe('Detailed reasoning, factors considered (like typical frost dates, growing degree days for the crop, soil temperature), and any important considerations or caveats.'),
  confidence: z.string().optional().describe('A qualitative confidence level (e.g., High, Medium, Low) based on available information for the region and crop.'),
});
export type SuggestPlantingHarvestingWindowsOutput = z.infer<typeof SuggestPlantingHarvestingWindowsOutputSchema>;

export async function suggestPlantingHarvestingWindows(input: SuggestPlantingHarvestingWindowsInput): Promise<SuggestPlantingHarvestingWindowsOutput> {
  return suggestPlantingHarvestingWindowsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestPlantingHarvestingWindowsPrompt',
  input: {schema: SuggestPlantingHarvestingWindowsInputSchema},
  output: {schema: SuggestPlantingHarvestingWindowsOutputSchema},
  prompt: `You are an expert agronomist specializing in crop scheduling for regions like {{{location}}}.
A farmer needs advice for {{{activity}}} their {{{cropType}}} crop.

Farmer's location: {{{location}}}
Crop: {{{cropType}}}
Activity: {{{activity}}}
{{#if additionalNotes}}
Additional Notes from farmer: {{{additionalNotes}}}
{{/if}}

Based on this information:
1.  Suggest a concise optimal window for this activity.
2.  Provide detailed advice explaining your reasoning. Consider typical weather patterns for the region, the crop's specific needs (e.g., soil temperature for germination, frost sensitivity, days to maturity for harvesting). If it's for planting, mention ideal soil conditions. If harvesting, mention signs of ripeness.
3.  Optionally, state your confidence level in this recommendation.

Format your response according to the output schema.
`,
});

const suggestPlantingHarvestingWindowsFlow = ai.defineFlow(
  {
    name: 'suggestPlantingHarvestingWindowsFlow',
    inputSchema: SuggestPlantingHarvestingWindowsInputSchema,
    outputSchema: SuggestPlantingHarvestingWindowsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
