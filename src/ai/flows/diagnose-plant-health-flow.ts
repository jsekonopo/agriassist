// src/ai/flows/diagnose-plant-health-flow.ts
'use server';
/**
 * @fileOverview AI agent for diagnosing plant health based on a photo and description.
 *
 * - diagnosePlantHealth - A function that handles the plant health diagnosis process.
 * - DiagnosePlantHealthInput - The input type for the diagnosePlantHealth function.
 * - DiagnosePlantHealthOutput - The return type for the diagnosePlantHealth function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DiagnosePlantHealthInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a plant, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  description: z.string().describe('A description of the plant and its observed symptoms or conditions.'),
});
export type DiagnosePlantHealthInput = z.infer<typeof DiagnosePlantHealthInputSchema>;

const DiagnosePlantHealthOutputSchema = z.object({
  plantIdentification: z.string().describe("The common or scientific name of the identified plant, or 'Unknown' if not identifiable as a plant or if identification is uncertain."),
  healthAssessment: z.string().describe("An overall assessment of the plant's health (e.g., Healthy, Diseased, Pest Infestation, Nutrient Deficiency, Environmental Stress)."),
  diagnosisDetails: z.string().describe("A detailed diagnosis of any issues found (e.g., specific disease name, type of pest, nature of deficiency). If healthy, confirm this."),
  recommendedActions: z.string().describe("Specific, actionable steps the farmer can take to address the issue, or advice for maintaining health if no issues are found. Include organic and conventional options if applicable."),
  confidenceLevel: z.string().describe("A qualitative assessment of the AI's confidence in the diagnosis (e.g., High, Medium, Low).").optional(),
});
export type DiagnosePlantHealthOutput = z.infer<typeof DiagnosePlantHealthOutputSchema>;

export async function diagnosePlantHealth(input: DiagnosePlantHealthInput): Promise<DiagnosePlantHealthOutput> {
  return diagnosePlantHealthFlow(input);
}

const prompt = ai.definePrompt({
  name: 'diagnosePlantHealthPrompt',
  input: {schema: DiagnosePlantHealthInputSchema},
  output: {schema: DiagnosePlantHealthOutputSchema},
  prompt: `You are an expert agricultural botanist and plant pathologist. Your task is to diagnose plant health issues based on a provided photograph and a textual description.

Analyze the image and the description carefully.

Image of the plant:
{{media url=photoDataUri}}

Description provided by the farmer:
"{{{description}}}"

Based on your analysis, provide the following information:
1.  **Plant Identification**: Identify the plant species if possible. If you cannot confidently identify the plant, state "Unknown" or provide a best guess with a disclaimer.
2.  **Health Assessment**: Briefly describe the overall health status (e.g., Healthy, Signs of Pest Infestation, Possible Fungal Disease, Nutrient Deficiency).
3.  **Diagnosis Details**: Elaborate on the specific problem. If it's a disease, name it. If pests, describe them. If a deficiency, specify which nutrient might be lacking. If it's environmental stress, explain. If the plant appears healthy, state that.
4.  **Recommended Actions**: Provide clear, actionable advice for the farmer. This could include treatment options (both organic and conventional if appropriate), cultural practice changes, or further diagnostic steps.
5.  **Confidence Level**: (Optional) State your confidence in this diagnosis (High, Medium, or Low).

Format your response strictly according to the output schema.
`,
});

const diagnosePlantHealthFlow = ai.defineFlow(
  {
    name: 'diagnosePlantHealthFlow',
    inputSchema: DiagnosePlantHealthInputSchema,
    outputSchema: DiagnosePlantHealthOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
