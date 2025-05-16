'use server';
/**
 * @fileOverview AI flow to interpret soil health test results.
 *
 * - interpretSoilHealth - A function that provides soil health interpretation.
 * - InterpretSoilHealthInput - The input type for the function.
 * - InterpretSoilHealthOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InterpretSoilHealthInputSchema = z.object({
  phLevel: z.number().describe('Soil pH level (e.g., 6.5).'),
  organicMatterPercent: z.number().describe('Soil organic matter percentage (e.g., 3.5).'),
  nitrogenPPM: z.number().describe('Soil Nitrogen level in PPM (e.g., 120).'),
  phosphorusPPM: z.number().describe('Soil Phosphorus level in PPM (e.g., 50).'),
  potassiumPPM: z.number().describe('Soil Potassium level in PPM (e.g., 150).'),
  cropType: z.string().optional().describe('Primary crop intended for this field (e.g., "Corn", "Vegetables"). This helps tailor recommendations.'),
  soilTexture: z.string().optional().describe('General soil texture if known (e.g., "Sandy Loam", "Heavy Clay").'),
});
export type InterpretSoilHealthInput = z.infer<typeof InterpretSoilHealthInputSchema>;

const InterpretSoilHealthOutputSchema = z.object({
  overallAssessment: z.string().describe('A general summary of the soil health based on the provided values.'),
  phInterpretation: z.string().describe('Interpretation of the pH level and its implications for nutrient availability. Suggests if adjustment is needed.'),
  organicMatterInterpretation: z.string().describe('Interpretation of the organic matter percentage and its importance. Suggests ways to improve if low.'),
  nutrientInterpretation: z.string().describe('Interpretation of N, P, K levels (e.g., deficient, adequate, surplus for the intended crop if specified).'),
  recommendations: z.string().describe('Actionable recommendations for soil amendments, fertilizer application, or other practices to improve soil health based on the interpretation. Be specific if possible.'),
});
export type InterpretSoilHealthOutput = z.infer<typeof InterpretSoilHealthOutputSchema>;

export async function interpretSoilHealth(input: InterpretSoilHealthInput): Promise<InterpretSoilHealthOutput> {
  return interpretSoilHealthFlow(input);
}

const prompt = ai.definePrompt({
  name: 'interpretSoilHealthPrompt',
  input: {schema: InterpretSoilHealthInputSchema},
  output: {schema: InterpretSoilHealthOutputSchema},
  prompt: `You are an expert soil scientist and agronomist.
A farmer has provided the following soil test results:

- pH Level: {{{phLevel}}}
- Organic Matter: {{{organicMatterPercent}}}%
- Nitrogen (N): {{{nitrogenPPM}}} PPM
- Phosphorus (P): {{{phosphorusPPM}}} PPM
- Potassium (K): {{{potassiumPPM}}} PPM
{{#if cropType}}- Intended Crop: {{{cropType}}}{{/if}}
{{#if soilTexture}}- Soil Texture: {{{soilTexture}}}{{/if}}

Based on these results:
1.  Provide an **Overall Assessment** of the soil's health.
2.  Interpret the **pH Level**: Is it optimal? What are the implications? Does it need adjustment (e.g., liming, sulfur)?
3.  Interpret the **Organic Matter Percentage**: Is it good? Why is it important? How can it be improved if needed?
4.  Interpret the **Nutrient Levels (N, P, K)**: Are they deficient, adequate, or in surplus, especially considering the intended crop (if specified)?
5.  Provide actionable **Recommendations**: Suggest specific soil amendments, fertilizer adjustments (type, rate if possible, but general advice is fine), or cultural practices to improve soil health and address any identified issues. Tailor to the crop if provided.

Format your response strictly according to the output schema.
`,
});

const interpretSoilHealthFlow = ai.defineFlow(
  {
    name: 'interpretSoilHealthFlow',
    inputSchema: InterpretSoilHealthInputSchema,
    outputSchema: InterpretSoilHealthOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
