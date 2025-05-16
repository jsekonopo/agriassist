
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
import { adminDb } from '@/lib/firebase-admin';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';

const SuggestPlantingHarvestingWindowsInputSchema = z.object({
  farmId: z.string().describe("The ID of the farm for which advice is sought. This will be used to fetch relevant farm data."),
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
  farmHistorySummary: z.string().optional().describe('A summary of relevant historical data from the farm used in the analysis, if available.'),
});
export type SuggestPlantingHarvestingWindowsOutput = z.infer<typeof SuggestPlantingHarvestingWindowsOutputSchema>;

export async function suggestPlantingHarvestingWindows(input: SuggestPlantingHarvestingWindowsInput): Promise<SuggestPlantingHarvestingWindowsOutput> {
  return suggestPlantingHarvestingWindowsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestPlantingHarvestingWindowsPrompt',
  input: {schema: SuggestPlantingHarvestingWindowsInputSchema.extend({ internalFarmHistory: z.string().optional() })},
  output: {schema: SuggestPlantingHarvestingWindowsOutputSchema.omit({ farmHistorySummary: true }) }, // AI doesn't generate this, flow adds it
  prompt: `You are an expert agronomist specializing in crop scheduling for regions like {{{location}}}.
A farmer needs advice for {{{activity}}} their {{{cropType}}} crop.

Farmer's location: {{{location}}}
Crop: {{{cropType}}}
Activity: {{{activity}}}
{{#if additionalNotes}}
Additional Notes from farmer: {{{additionalNotes}}}
{{/if}}

{{#if internalFarmHistory}}
Historical context for this crop on this farm:
{{{internalFarmHistory}}}
Consider this farm-specific history along with general agronomic knowledge.
{{/if}}

Based on all available information:
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
  async (input) => {
    let internalFarmHistory: string | undefined = undefined;
    let farmHistorySummaryForOutput: string | undefined = undefined;
    const historyLines: string[] = [];

    try {
      // Fetch past planting logs for this crop
      const plantingQuery = query(
        collection(adminDb, "plantingLogs"),
        where("farmId", "==", input.farmId),
        where("cropName", "==", input.cropType),
        orderBy("plantingDate", "desc"),
        limit(5) // Get up to 5 recent planting dates
      );
      const plantingSnapshot = await getDocs(plantingQuery);
      if (!plantingSnapshot.empty) {
        const plantingDates = plantingSnapshot.docs.map(doc => format(parseISO(doc.data().plantingDate), "MMM yyyy")).join(', ');
        historyLines.push(`- Past plantings for ${input.cropType}: ${plantingDates}.`);
      }

      // Fetch past harvesting logs for this crop
      const harvestingQuery = query(
        collection(adminDb, "harvestingLogs"),
        where("farmId", "==", input.farmId),
        where("cropName", "==", input.cropType),
        orderBy("harvestDate", "desc"),
        limit(5) // Get up to 5 recent harvests
      );
      const harvestingSnapshot = await getDocs(harvestingQuery);
      if (!harvestingSnapshot.empty) {
        const harvestDates = harvestingSnapshot.docs.map(doc => format(parseISO(doc.data().harvestDate), "MMM yyyy")).join(', ');
        historyLines.push(`- Past harvests for ${input.cropType}: ${harvestDates}.`);
        
        let totalYield = 0;
        let yieldCount = 0;
        const yieldUnits = new Set<string>();
        harvestingSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (typeof data.yieldAmount === 'number') {
            totalYield += data.yieldAmount;
            yieldCount++;
          }
          if (data.yieldUnit) {
            yieldUnits.add(data.yieldUnit);
          }
        });
        if (yieldCount > 0) {
          const avgYield = (totalYield / yieldCount).toFixed(1);
          const unitsString = Array.from(yieldUnits).join('/') || 'units';
          historyLines.push(`- Average yield from ${yieldCount} logged harvest(s): ${avgYield} ${unitsString}.`);
        }
      }

      if (historyLines.length > 0) {
        internalFarmHistory = historyLines.join("\n");
        farmHistorySummaryForOutput = "AI considered the following historical data from your farm: " + historyLines.map(line => line.replace(/^- /, "")).join(" ");
      }

    } catch (e) {
      console.error("Error fetching farm history for planting/harvesting advice:", e);
      internalFarmHistory = "Could not fetch detailed farm history due to an error.";
      farmHistorySummaryForOutput = "Note: AI could not fetch detailed farm history for context due to an error.";
    }

    const promptInput = {
      ...input,
      internalFarmHistory,
    };

    const {output} = await prompt(promptInput);
    
    return {
      ...output!,
      farmHistorySummary: farmHistorySummaryForOutput,
    };
  }
);
