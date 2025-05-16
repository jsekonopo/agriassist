
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
import { adminDb } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

const AdviseSustainablePracticesInputSchema = z.object({
  farmId: z.string().describe("The ID of the farm for which advice is sought. This will be used to fetch relevant farm data."),
  sustainabilityGoals: z.string().describe('Key sustainability goals for the farm (e.g., "Improve soil health", "Reduce water usage", "Enhance biodiversity", "Explore carbon credit potential").'),
  cropTypes: z.string().optional().describe('Comma-separated list of main crops grown (e.g., "Corn, Soybeans, Alfalfa"). If not provided, AI will attempt to infer from farm logs.'),
  farmSizeAcres: z.number().optional().describe('Approximate size of the farm in acres. If not provided, AI might estimate from field data.'),
  currentPractices: z.string().optional().describe('Brief description of current farming practices (e.g., "Conventional tillage, NPK fertilizers", "No-till for 5 years, uses cover crops"). If not provided, AI may infer some aspects from logs.'),
  locationContext: z.string().optional().describe('General location or climate context if relevant (e.g., "Drought-prone area", "Heavy clay soil").'),
});
export type AdviseSustainablePracticesInput = z.infer<typeof AdviseSustainablePracticesInputSchema>;

const AdviseSustainablePracticesOutputSchema = z.object({
  recommendedPractices: z.string().describe('A list of 2-4 key recommended sustainable practices, each with a brief explanation of how it applies to the farm and its benefits towards the stated goals. Use Markdown for formatting if possible (e.g., bullet points).'),
  implementationTips: z.string().describe('Practical tips or starting points for implementing one or two of the top recommended practices.'),
  potentialCarbonCreditInfo: z.string().optional().describe('Brief information on how the suggested practices might relate to carbon credits, if applicable to the goals.'),
  dataSummary: z.string().optional().describe("A brief summary of the farm data used by the AI to generate the advice, if fetched from Firestore."),
});
export type AdviseSustainablePracticesOutput = z.infer<typeof AdviseSustainablePracticesOutputSchema>;

export async function adviseSustainablePractices(input: AdviseSustainablePracticesInput): Promise<AdviseSustainablePracticesOutput> {
  return adviseSustainablePracticesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'adviseSustainablePracticesPrompt',
  input: { schema: AdviseSustainablePracticesInputSchema.extend({ farmDataSummary: z.string().optional() }) },
  output: { schema: AdviseSustainablePracticesOutputSchema },
  prompt: `You are an expert advisor in sustainable agriculture and regenerative farming practices.
A farmer is seeking advice based on the following farm details:

Sustainability Goals: {{{sustainabilityGoals}}}

{{#if cropTypes}}Farmer-provided Main Crops: {{{cropTypes}}}{{/if}}
{{#if farmSizeAcres}}Farmer-provided Farm Size: {{{farmSizeAcres}}} acres{{/if}}
{{#if currentPractices}}Farmer-provided Current Practices: {{{currentPractices}}}{{/if}}
{{#if locationContext}}Farmer-provided Location/Climate Context: {{{locationContext}}}{{/if}}

{{#if farmDataSummary}}
The following information was derived from the farm's records:
{{{farmDataSummary}}}
{{/if}}

Based on all available information (prioritizing farmer-provided details if they conflict with derived data):
1.  Recommend 2-4 key sustainable practices relevant to their crops, goals, and context. For each practice, briefly explain its benefits and how it applies.
2.  Provide practical implementation tips for 1-2 of the top recommendations.
3.  If their goals mention carbon credits or it's highly relevant, briefly discuss how the suggested practices might contribute to carbon sequestration or credit opportunities.
4.  If farm data was used, include a brief summary of what data informed your advice in the 'dataSummary' output field.

Format your response according to the output schema. Use Markdown for lists if possible in the "recommendedPractices" field.
`,
});

const adviseSustainablePracticesFlow = ai.defineFlow(
  {
    name: 'adviseSustainablePracticesFlow',
    inputSchema: AdviseSustainablePracticesInputSchema,
    outputSchema: AdviseSustainablePracticesOutputSchema,
  },
  async (input) => {
    let farmDataSummaryLines: string[] = [];
    let derivedCropTypes = "";
    let derivedFarmSize = 0;

    try {
      // Fetch planting logs for crop types
      const plantingLogsQuery = query(
        collection(adminDb, "plantingLogs"),
        where("farmId", "==", input.farmId),
        orderBy("plantingDate", "desc"),
        limit(20) // Get recent plantings
      );
      const plantingLogsSnapshot = await getDocs(plantingLogsQuery);
      const crops = new Set<string>();
      plantingLogsSnapshot.forEach(doc => crops.add(doc.data().cropName));
      if (crops.size > 0) {
        derivedCropTypes = Array.from(crops).join(', ');
        farmDataSummaryLines.push(`- Recent crops logged: ${derivedCropTypes}.`);
      }

      // Fetch fields for farm size
      const fieldsQuery = query(collection(adminDb, "fields"), where("farmId", "==", input.farmId));
      const fieldsSnapshot = await getDocs(fieldsQuery);
      let totalAcres = 0;
      fieldsSnapshot.forEach(doc => {
        const fieldData = doc.data();
        if (fieldData.fieldSize && typeof fieldData.fieldSize === 'number') {
          if (!fieldData.fieldSizeUnit || fieldData.fieldSizeUnit.toLowerCase().includes('acre')) {
            totalAcres += fieldData.fieldSize;
          } else if (fieldData.fieldSizeUnit.toLowerCase().includes('hectare')) {
            totalAcres += fieldData.fieldSize * 2.47105; // Convert hectares to acres
          }
        }
      });
      if (totalAcres > 0) {
        derivedFarmSize = parseFloat(totalAcres.toFixed(1));
        farmDataSummaryLines.push(`- Total field area from logs: ~${derivedFarmSize} acres.`);
      }

      // Fetch recent soil logs to infer practices/context (example)
      const soilLogsQuery = query(
        collection(adminDb, "soilDataLogs"),
        where("farmId", "==", input.farmId),
        orderBy("sampleDate", "desc"),
        limit(5)
      );
      const soilLogsSnapshot = await getDocs(soilLogsQuery);
      if (!soilLogsSnapshot.empty) {
        farmDataSummaryLines.push(`- Recent soil data has been logged, indicating active soil management.`);
        // Could infer more here, e.g. if organic matter is high, user might be using good practices.
      }

    } catch (e) {
      console.error("Error fetching farm data for sustainable practices advice:", e);
      farmDataSummaryLines.push("- Error encountered while trying to fetch detailed farm records. Advice will be more general.");
    }
    
    const farmDataSummary = farmDataSummaryLines.length > 0 ? farmDataSummaryLines.join("\n") : undefined;

    const promptInput = {
      ...input,
      cropTypes: input.cropTypes || derivedCropTypes || undefined, // Prioritize user input
      farmSizeAcres: input.farmSizeAcres || (derivedFarmSize > 0 ? derivedFarmSize : undefined),
      farmDataSummary,
    };

    const {output} = await prompt(promptInput);
    // Ensure dataSummary is part of the output if it was generated
    if (output && farmDataSummary && !output.dataSummary) {
        output.dataSummary = farmDataSummary;
    }
    return output!;
  }
);

