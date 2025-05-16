// src/ai/flows/suggest-optimization-strategies.ts
'use server';
/**
 * @fileOverview AI flow to suggest optimization strategies for a farm.
 *
 * - suggestOptimizationStrategies - A function that suggests optimization strategies for a farm.
 * - SuggestOptimizationStrategiesInput - The input type for the suggestOptimizationStrategies function.
 * - SuggestOptimizationStrategiesOutput - The return type for the suggestOptimizationStrategies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestOptimizationStrategiesInputSchema = z.object({
  farmSize: z.number().describe('The size of the farm in acres.'),
  location: z.string().describe('The location of the farm (e.g., Ottawa, Ontario).'),
  crops: z.string().describe('The crops currently being grown on the farm (e.g., corn, soybeans).'),
  soilType: z.string().describe('The type of soil on the farm (e.g., sandy, clay).'),
  historicalYieldData: z.string().describe('Historical yield data for the farm.'),
  currentWeatherData: z.string().describe('Current weather conditions for the farm.'),
  fertilizerUsage: z.string().describe('Fertilizer usage data for the farm.'),
  waterUsage: z.string().describe('Water usage data for the farm.'),
});
export type SuggestOptimizationStrategiesInput = z.infer<
  typeof SuggestOptimizationStrategiesInputSchema
>;

const SuggestOptimizationStrategiesOutputSchema = z.object({
  strategies: z.string().describe('A list of optimization strategies for the farm.'),
});
export type SuggestOptimizationStrategiesOutput = z.infer<
  typeof SuggestOptimizationStrategiesOutputSchema
>;

export async function suggestOptimizationStrategies(
  input: SuggestOptimizationStrategiesInput
): Promise<SuggestOptimizationStrategiesOutput> {
  return suggestOptimizationStrategiesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestOptimizationStrategiesPrompt',
  input: {schema: SuggestOptimizationStrategiesInputSchema},
  output: {schema: SuggestOptimizationStrategiesOutputSchema},
  prompt: `You are an AI Farm Expert, providing actionable advice to farmers to improve their operations.

  Based on the following information about the farm, suggest optimization strategies to improve efficiency and increase yields.

  Farm Size: {{{farmSize}}} acres
  Location: {{{location}}}
  Crops: {{{crops}}}
  Soil Type: {{{soilType}}}
  Historical Yield Data: {{{historicalYieldData}}}
  Current Weather Data: {{{currentWeatherData}}}
  Fertilizer Usage: {{{fertilizerUsage}}}
  Water Usage: {{{waterUsage}}}

  Consider factors such as crop rotation, irrigation techniques, fertilizer application, and pest control.
  Provide specific and practical recommendations.
  Format your response as a list of strategies.
  `,
});

const suggestOptimizationStrategiesFlow = ai.defineFlow(
  {
    name: 'suggestOptimizationStrategiesFlow',
    inputSchema: SuggestOptimizationStrategiesInputSchema,
    outputSchema: SuggestOptimizationStrategiesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
