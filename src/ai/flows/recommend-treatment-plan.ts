
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
import { adminDb } from '@/lib/firebase-admin';
import { doc, getDoc } from 'firebase/firestore';

const RecommendTreatmentPlanInputSchema = z.object({
  cropType: z.string().describe('The type of crop affected.'),
  symptoms: z.string().describe('A description of the symptoms observed on the crop.'),
  farmId: z.string().optional().describe("The ID of the farm, used if fieldId is provided."),
  fieldId: z.string().optional().describe("The ID of the specific field where the crop is located, if applicable."),
});
export type RecommendTreatmentPlanInput = z.infer<typeof RecommendTreatmentPlanInputSchema>;

const RecommendTreatmentPlanOutputSchema = z.object({
  diagnosis: z.string().describe('The likely diagnosis of the crop issue.'),
  treatmentPlan: z.string().describe('A recommended treatment plan to address the issue. Include organic and conventional options if applicable.'),
  preventionTips: z.string().describe('Tips to prevent future occurrences of the issue.'),
  fieldName: z.string().optional().describe("The name of the field, if provided in the input."),
});
export type RecommendTreatmentPlanOutput = z.infer<typeof RecommendTreatmentPlanOutputSchema>;

export async function recommendTreatmentPlan(input: RecommendTreatmentPlanInput): Promise<RecommendTreatmentPlanOutput> {
  return recommendTreatmentPlanFlow(input);
}

const prompt = ai.definePrompt({
  name: 'recommendTreatmentPlanPrompt',
  input: {schema: RecommendTreatmentPlanInputSchema.extend({ internalFieldName: z.string().optional() })},
  output: {schema: RecommendTreatmentPlanOutputSchema.omit({ fieldName: true })}, // AI doesn't generate fieldName, flow adds it
  prompt: `You are an expert in agricultural plant diseases and pest management.
{{#if internalFieldName}}The crop is located in a field named "{{internalFieldName}}".{{/if}}

Based on the crop type and symptoms described, provide a diagnosis, a detailed treatment plan (including both organic and conventional options if appropriate), and prevention tips.

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
  async (input) => {
    let fieldName: string | undefined = undefined;
    if (input.farmId && input.fieldId) {
      try {
        const fieldDocRef = doc(adminDb, "fields", input.fieldId);
        const fieldDocSnap = await getDoc(fieldDocRef);
        if (fieldDocSnap.exists() && fieldDocSnap.data()?.farmId === input.farmId) {
          fieldName = fieldDocSnap.data()?.fieldName;
        }
      } catch (error) {
        console.error("Error fetching field name for treatment plan:", error);
      }
    }

    const promptInput = {
      ...input,
      internalFieldName: fieldName,
    };

    const {output} = await prompt(promptInput);
    
    return {
        ...output!,
        fieldName: fieldName, 
    };
  }
);

