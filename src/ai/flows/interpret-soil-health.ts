
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
import { adminDb } from '@/lib/firebase-admin';
import { doc, getDoc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';

const InterpretSoilHealthInputSchema = z.object({
  farmId: z.string().describe("The ID of the farm to which this soil data belongs."),
  fieldId: z.string().optional().describe("The ID of the specific field if applicable. This helps in providing context."),
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
  fieldName: z.string().optional().describe("The name of the field if one was specified in the input."),
  overallAssessment: z.string().describe('A general summary of the soil health based on the provided values.'),
  phInterpretation: z.string().describe('Interpretation of the pH level and its implications for nutrient availability. Suggests if adjustment is needed.'),
  organicMatterInterpretation: z.string().describe('Interpretation of the organic matter percentage and its importance. Suggests ways to improve if low.'),
  nutrientInterpretation: z.string().describe('Interpretation of N, P, K levels (e.g., deficient, adequate, surplus for the intended crop if specified).'),
  recommendations: z.string().describe('Actionable recommendations for soil amendments, fertilizer application, or other practices to improve soil health based on the interpretation. Be specific if possible.'),
  historicalContextSummary: z.string().optional().describe("A summary of historical soil test data for this field if it was found and used as context."),
});
export type InterpretSoilHealthOutput = z.infer<typeof InterpretSoilHealthOutputSchema>;

export async function interpretSoilHealth(input: InterpretSoilHealthInput): Promise<InterpretSoilHealthOutput> {
  return interpretSoilHealthFlow(input);
}

const prompt = ai.definePrompt({
  name: 'interpretSoilHealthPrompt',
  input: {schema: InterpretSoilHealthInputSchema.extend({ 
    internalFieldName: z.string().optional(),
    internalHistoricalContext: z.string().optional(),
  })},
  output: {schema: InterpretSoilHealthOutputSchema.omit({fieldName: true, historicalContextSummary: true})}, // fieldName & historical context added by flow
  prompt: `You are an expert soil scientist and agronomist.
A farmer has provided the following soil test results{{#if internalFieldName}} for their field named "{{internalFieldName}}"{{/if}}:

Current Test Results:
- pH Level: {{{phLevel}}}
- Organic Matter: {{{organicMatterPercent}}}%
- Nitrogen (N): {{{nitrogenPPM}}} PPM
- Phosphorus (P): {{{phosphorusPPM}}} PPM
- Potassium (K): {{{potassiumPPM}}} PPM
{{#if cropType}}- Intended Crop: {{{cropType}}}{{/if}}
{{#if soilTexture}}- Soil Texture: {{{soilTexture}}}{{/if}}

{{#if internalHistoricalContext}}
Historical context for this field:
{{{internalHistoricalContext}}}
Consider this historical data when providing your interpretation and recommendations.
{{/if}}

Based on all available information (current test and historical context if provided):
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
  async (input) => {
    let fieldName: string | undefined = undefined;
    let historicalContextSummaryForPrompt: string | undefined = undefined;
    let historicalContextSummaryForOutput: string | undefined = undefined;

    if (input.fieldId && input.farmId) {
      try {
        const fieldDocRef = doc(adminDb, "fields", input.fieldId);
        const fieldDocSnap = await getDoc(fieldDocRef);
        if (fieldDocSnap.exists() && fieldDocSnap.data()?.farmId === input.farmId) {
          fieldName = fieldDocSnap.data()?.fieldName;

          // Fetch historical soil data for this field
          const historicalQuery = query(
            collection(adminDb, "soilDataLogs"),
            where("farmId", "==", input.farmId),
            where("fieldId", "==", input.fieldId),
            orderBy("sampleDate", "desc"),
            limit(5) // Get last 5 tests for context
          );
          const historicalSnapshot = await getDocs(historicalQuery);
          if (!historicalSnapshot.empty) {
            const historicalLines: string[] = ["Recent past soil tests for this field:"];
            historicalSnapshot.docs.forEach(logDoc => {
              const logData = logDoc.data();
              let line = `- On ${format(parseISO(logData.sampleDate), "MMM yyyy")}:`;
              if (logData.phLevel !== undefined) line += ` pH ${logData.phLevel.toFixed(1)}`;
              if (logData.organicMatter) line += `, OM ${logData.organicMatter}`;
              if (logData.nutrients?.nitrogen) line += `, N ${logData.nutrients.nitrogen}`;
              if (logData.nutrients?.phosphorus) line += `, P ${logData.nutrients.phosphorus}`;
              if (logData.nutrients?.potassium) line += `, K ${logData.nutrients.potassium}`;
              historicalLines.push(line + ".");
            });
            if (historicalLines.length > 1) { // more than just the header
                historicalContextSummaryForPrompt = historicalLines.join("\n");
                historicalContextSummaryForOutput = "AI considered the following historical context: " + historicalLines.slice(1).join(" ").replace(/- /g, "");
            }
          } else {
            historicalContextSummaryForOutput = "No significant historical soil test data found for this field in the logs.";
          }
        }
      } catch (error) {
        console.error("Error fetching field or historical soil data:", error);
        historicalContextSummaryForOutput = "Could not fetch historical soil data due to an error.";
      }
    }
    
    const promptInput = {
        ...input,
        internalFieldName: fieldName,
        internalHistoricalContext: historicalContextSummaryForPrompt,
    };

    const {output} = await prompt(promptInput);
    
    return {
        ...output!,
        fieldName: fieldName,
        historicalContextSummary: historicalContextSummaryForOutput,
    };
  }
);
