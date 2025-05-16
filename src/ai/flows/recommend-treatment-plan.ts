// src/ai/flows/recommend-treatment-plan.ts
'use server';

/**
 * @fileOverview AI agent that recommends treatment plans for crop diseases or pest infestations.
 *
 * - recommendTreatmentPlan - A function that recommends treatment plans based on described symptoms.
 * - RecommendTreatmentPlanInput - The input type for the recommendTreatmentPlan function.
 * - RecommendTreatmentPlanOutput - The return type for the recommendTreatmentPlan function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RecommendTreatmentPlanInputSchema = z.object({
  cropType: z.string().describe('The type of crop affected.'),
  symptoms: z.string().describe('A description of the symptoms observed on the crop.'),
});
export type RecommendTreatmentPlanInput = z.infer<typeof RecommendTreatmentPlanInputSchema>;

const RecommendTreatmentPlanOutputSchema = z.object({
  diagnosis: z.string().describe('The likely diagnosis of the crop issue.'),
  treatmentPlan: z.string().describe('A recommended treatment plan to address the issue.'),
  preventionTips: z.string().describe('Tips to prevent future occurrences of the issue.'),
});
export type RecommendTreatmentPlanOutput = z.infer<typeof RecommendTreatmentPlanOutputSchema>;

export async function recommendTreatmentPlan(input: RecommendTreatmentPlanInput): Promise<RecommendTreatmentPlanOutput> {
  return recommendTreatmentPlanFlow(input);
}

const prompt = ai.definePrompt({
  name: 'recommendTreatmentPlanPrompt',
  input: {schema: RecommendTreatmentPlanInputSchema},
  output: {schema: RecommendTreatmentPlanOutputSchema},
  prompt: `You are an expert in agricultural plant diseases and pest management.

  Based on the crop type and symptoms described, provide a diagnosis, a treatment plan, and prevention tips.

  Crop Type: {{{cropType}}}
  Symptoms: {{{symptoms}}}
  `,
});

const recommendTreatmentPlanFlow = ai.defineFlow(
  {
    name: 'recommendTreatmentPlanFlow',
    inputSchema: RecommendTreatmentPlanInputSchema,
    outputSchema: RecommendTreatmentPlanOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
