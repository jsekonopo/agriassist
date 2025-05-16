
'use server';
/**
 * @fileOverview AI flow to interpret soil health test results, now with historical trend analysis.
 *
 * - interpretSoilHealth - A function that provides soil health interpretation.
 * - InterpretSoilHealthInput - The input type for the function.
 * - InterpretSoilHealthOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { adminDb } from '@/lib/firebase-admin';
import { doc, getDoc, collection, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { format, parseISO, differenceInDays } from 'date-fns';

const InterpretSoilHealthInputSchema = z.object({
  farmId: z.string().describe("The ID of the farm to which this soil data belongs."),
  fieldId: z.string().optional().describe("The ID of the specific field if applicable. This helps in providing context and fetching historical data."),
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
  historicalContextSummary: z.string().optional().describe("A summary of historical soil test data trends for this field if it was found and used as context."),
});
export type InterpretSoilHealthOutput = z.infer<typeof InterpretSoilHealthOutputSchema>;

export async function interpretSoilHealth(input: InterpretSoilHealthInput): Promise<InterpretSoilHealthOutput> {
  return interpretSoilHealthFlow(input);
}

const prompt = ai.definePrompt({
  name: 'interpretSoilHealthPrompt',
  input: {schema: InterpretSoilHealthInputSchema.extend({ 
    internalFieldName: z.string().optional(),
    internalHistoricalContext: z.string().optional(), // Will now include trend analysis
  })},
  output: {schema: InterpretSoilHealthOutputSchema.omit({fieldName: true, historicalContextSummary: true})},
  prompt: `You are an expert soil scientist and agronomist.
A farmer has provided the following current soil test results{{#if internalFieldName}} for their field named "{{internalFieldName}}"{{/if}}:

Current Test Results:
- pH Level: {{{phLevel}}}
- Organic Matter: {{{organicMatterPercent}}}%
- Nitrogen (N): {{{nitrogenPPM}}} PPM
- Phosphorus (P): {{{phosphorusPPM}}} PPM
- Potassium (K): {{{potassiumPPM}}} PPM
{{#if cropType}}- Intended Crop: {{{cropType}}}{{/if}}
{{#if soilTexture}}- Soil Texture: {{{soilTexture}}}{{/if}}

{{#if internalHistoricalContext}}
Historical context and observed trends for this field:
{{{internalHistoricalContext}}}
Please consider these historical trends when providing your interpretation and recommendations for the current test results.
{{/if}}

Based on all available information (current test and historical context/trends if provided):
1.  Provide an **Overall Assessment** of the soil's health based on the current test.
2.  Interpret the **pH Level**: Is it optimal? What are the implications? Does it need adjustment (e.g., liming, sulfur)?
3.  Interpret the **Organic Matter Percentage**: Is it good? Why is it important? How can it be improved if needed?
4.  Interpret the **Nutrient Levels (N, P, K)**: Are they deficient, adequate, or in surplus, especially considering the intended crop (if specified)?
5.  Provide actionable **Recommendations**: Suggest specific soil amendments, fertilizer adjustments (type, rate if possible, but general advice is fine), or cultural practices to improve soil health and address any identified issues. Tailor to the crop if provided.

Format your response strictly according to the output schema.
`,
});

// Helper function to analyze trends
function analyzeTrend(values: number[]): string {
  if (values.length < 2) return "Not enough data for trend analysis.";
  const first = values[0];
  const last = values[values.length - 1];
  const average = values.reduce((sum, val) => sum + val, 0) / values.length;
  
  let trend = "stable";
  if (last > first * 1.1) trend = "increasing"; // More than 10% increase
  else if (last < first * 0.9) trend = "decreasing"; // More than 10% decrease

  return `Trend: ${trend} (recent: ${last.toFixed(1)}, avg: ${average.toFixed(1)}, oldest: ${first.toFixed(1)}).`;
}


const interpretSoilHealthFlow = ai.defineFlow(
  {
    name: 'interpretSoilHealthFlow',
    inputSchema: InterpretSoilHealthInputSchema,
    outputSchema: InterpretSoilHealthOutputSchema,
  },
  async (input) => {
    let fieldName: string | undefined = undefined;
    let historicalContextForPrompt: string | undefined = undefined;
    let historicalSummaryForOutput: string | undefined = undefined;

    if (input.fieldId && input.farmId) {
      try {
        const fieldDocRef = doc(adminDb, "fields", input.fieldId);
        const fieldDocSnap = await getDoc(fieldDocRef);
        if (fieldDocSnap.exists() && fieldDocSnap.data()?.farmId === input.farmId) {
          fieldName = fieldDocSnap.data()?.fieldName;

          const historicalQuery = query(
            collection(adminDb, "soilDataLogs"),
            where("farmId", "==", input.farmId),
            where("fieldId", "==", input.fieldId),
            orderBy("sampleDate", "desc"),
            limit(5) 
          );
          const historicalSnapshot = await getDocs(historicalQuery);
          
          if (!historicalSnapshot.empty) {
            const promptLines: string[] = [];
            const outputSummaryLines: string[] = ["AI considered the following historical context:"];
            
            const historicalTests = historicalSnapshot.docs.map(logDoc => {
              const data = logDoc.data();
              return {
                date: data.sampleDate ? parseISO(data.sampleDate) : new Date(0),
                ph: data.phLevel,
                om: typeof data.organicMatter === 'string' ? parseFloat(data.organicMatter.replace('%','')) : data.organicMatter, // handle OM as string e.g. "3.5%"
                n: typeof data.nutrients?.nitrogen === 'string' ? parseFloat(data.nutrients.nitrogen.replace(/ppm|high|medium|low/i, '').trim()) : data.nutrients?.nitrogen,
                p: typeof data.nutrients?.phosphorus === 'string' ? parseFloat(data.nutrients.phosphorus.replace(/ppm|high|medium|low/i, '').trim()) : data.nutrients?.phosphorus,
                k: typeof data.nutrients?.potassium === 'string' ? parseFloat(data.nutrients.potassium.replace(/ppm|high|medium|low/i, '').trim()) : data.nutrients?.potassium,
              };
            }).sort((a,b) => a.date.getTime() - b.date.getTime()); // Sort oldest to newest for trend analysis

            promptLines.push("Recent past soil tests for this field (oldest to newest):");
             historicalTests.forEach(test => {
                let line = `- On ${format(test.date, "MMM yyyy")}:`;
                if (test.ph !== undefined) line += ` pH ${test.ph.toFixed(1)}`;
                if (test.om !== undefined) line += `, OM ${test.om}%`;
                if (test.n !== undefined) line += `, N ${test.n}ppm`;
                if (test.p !== undefined) line += `, P ${test.p}ppm`;
                if (test.k !== undefined) line += `, K ${test.k}ppm`;
                promptLines.push(line + ".");
            });

            // Simple Trend Analysis (can be made more sophisticated)
            const phValues = historicalTests.map(t => t.ph).filter(v => v !== undefined) as number[];
            const omValues = historicalTests.map(t => t.om).filter(v => v !== undefined) as number[];
            // Add NPK if you have consistent numeric data for them
            
            if (phValues.length >= 2) promptLines.push(`  - pH levels: ${analyzeTrend(phValues)}`);
            if (omValues.length >= 2) promptLines.push(`  - Organic Matter %: ${analyzeTrend(omValues)}`);
            
            if (promptLines.length > 1) {
                historicalContextForPrompt = promptLines.join("\n");
                // Construct a more user-friendly summary for the output
                let trendsSummary = "Historical trends considered: ";
                if (phValues.length >=2) trendsSummary += `pH ${analyzeTrend(phValues).toLowerCase().replace('trend: ','')}`;
                if (omValues.length >=2) trendsSummary += (phValues.length >=2 ? "; " : "") + `OM ${analyzeTrend(omValues).toLowerCase().replace('trend: ','')}`;
                outputSummaryLines.push(trendsSummary === "Historical trends considered: " ? "Specific trends not determined from available data." : trendsSummary);
                historicalSummaryForOutput = outputSummaryLines.join(" ");
            }

          } else {
            historicalSummaryForOutput = "No significant historical soil test data found for this field in the logs.";
          }
        }
      } catch (error) {
        console.error("Error fetching field or historical soil data:", error);
        historicalSummaryForOutput = "Could not fetch or analyze historical soil data due to an error.";
      }
    }
    
    const promptInput = {
        ...input,
        internalFieldName: fieldName,
        internalHistoricalContext: historicalContextForPrompt,
    };

    const {output} = await prompt(promptInput);
    
    return {
        ...output!,
        fieldName: fieldName,
        historicalContextSummary: historicalSummaryForOutput,
    };
  }
);

