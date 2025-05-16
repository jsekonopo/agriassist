
// src/ai/flows/suggest-optimization-strategies.ts
'use server';
/**
 * @fileOverview AI flow to suggest optimization strategies for a farm based on comprehensive farm data.
 *
 * - suggestOptimizationStrategies - A function that suggests optimization strategies for a farm.
 * - SuggestOptimizationStrategiesInput - The input type for the suggestOptimizationStrategies function.
 * - SuggestOptimizationStrategiesOutput - The return type for the suggestOptimizationStrategies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { adminDb } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';

const HECTARE_TO_ACRE = 2.47105;

const SuggestOptimizationStrategiesInputSchema = z.object({
  farmId: z.string().describe("The ID of the farm for which to suggest optimization strategies."),
  optimizationGoals: z.string().optional().describe('Specific goals the farmer wants to focus on for optimization (e.g., "reduce water usage", "improve corn yield", "enhance soil health").'),
});
export type SuggestOptimizationStrategiesInput = z.infer<
  typeof SuggestOptimizationStrategiesInputSchema
>;

const SuggestOptimizationStrategiesOutputSchema = z.object({
  strategies: z.string().describe('A list of actionable optimization strategies for the farm, considering the provided context and goals. Formatted for readability, potentially using Markdown.'),
  dataSummary: z.string().optional().describe("A brief summary of the farm data used by the AI to generate the advice."),
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
  input: {schema: SuggestOptimizationStrategiesInputSchema.extend({
    farmName: z.string().optional(),
    totalAcreage: z.number().optional(),
    fieldCount: z.number().optional(),
    recentCrops: z.string().optional(), // Comma-separated list
    averageYields: z.string().optional(), // e.g., "Corn: 150 bu/acre, Soybeans: 45 bu/acre"
    soilSummary: z.string().optional(), // e.g., "Predominantly Loamy Sand. Recent tests show average pH 6.5, OM 3%."
    fertilizerSummary: z.string().optional(), // e.g., "Recent NPK application on corn. Manure used on Field X."
    irrigationSummary: z.string().optional(), // e.g., "Mainly rain-fed. Field Y uses drip irrigation. Last irrigation 2 weeks ago."
    recentWeatherSummary: z.string().optional(), // e.g., "Recent heavy rainfall followed by a dry week. Temperatures moderate."
  })},
  output: {schema: SuggestOptimizationStrategiesOutputSchema.omit({dataSummary: true})},
  prompt: `You are an AI Farm Optimization Expert, providing actionable advice to farmers to improve their operations.

Based on the following comprehensive information about the farm, and the farmer's specific goals if provided, suggest optimization strategies to improve efficiency, sustainability, and increase yields.

Farm Profile:
{{#if farmName}}- Farm Name: {{{farmName}}}{{/if}}
{{#if totalAcreage}}- Approximate Total Size: {{{totalAcreage}}} acres (across {{{fieldCount}}} fields).{{/if}}
{{#if recentCrops}}- Main Crops Logged Recently: {{{recentCrops}}}.{{/if}}
{{#if averageYields}}- Historical Average Yields: {{{averageYields}}}.{{/if}}
{{#if soilSummary}}- Soil Conditions Summary: {{{soilSummary}}}.{{/if}}
{{#if fertilizerSummary}}- Fertilizer Usage Summary: {{{fertilizerSummary}}}.{{/if}}
{{#if irrigationSummary}}- Water Usage/Irrigation Summary: {{{irrigationSummary}}}.{{/if}}
{{#if recentWeatherSummary}}- Recent Weather Context: {{{recentWeatherSummary}}}.{{/if}}

{{#if optimizationGoals}}
The farmer has these specific optimization goals: "{{{optimizationGoals}}}"
Please tailor your suggestions to help achieve these goals first and foremost, while also considering overall farm improvement.
{{/if}}

Consider factors such as:
- Crop rotation and diversification.
- Precision agriculture techniques (if applicable based on data).
- Soil health management (organic matter improvement, pH adjustment).
- Nutrient management and fertilizer application efficiency.
- Water conservation and irrigation optimization.
- Pest and disease management strategies (integrated pest management).
- Tillage practices.
- Equipment utilization.
- Potential for new technologies or practices suitable for this farm's scale and context.
- Economic viability and sustainability of suggestions.

Provide specific, practical, and actionable recommendations. Format your response as a list of strategies, clearly explaining the reasoning and potential benefits for each.
Focus on 3-5 key strategies that would likely offer the most impact.
  `,
});

const suggestOptimizationStrategiesFlow = ai.defineFlow(
  {
    name: 'suggestOptimizationStrategiesFlow',
    inputSchema: SuggestOptimizationStrategiesInputSchema,
    outputSchema: SuggestOptimizationStrategiesOutputSchema,
  },
  async (input) => {
    const farmId = input.farmId;
    const dataSummaryLines: string[] = [];
    let farmNameFromDb: string | undefined;
    let totalAcreageFromDb = 0;
    let fieldCountFromDb = 0;
    const recentCropsSet = new Set<string>();
    const yieldMap = new Map<string, { total: number; count: number; units: Set<string> }>();
    const soilObservations: string[] = [];
    const fertilizerApps: string[] = [];
    const irrigationEvents: string[] = [];
    const weatherNotes: string[] = [];

    try {
      // Fetch Farm Details
      const farmDocRef = adminDb.collection('farms').doc(farmId);
      const farmDocSnap = await farmDocRef.get();
      if (farmDocSnap.exists()) {
        farmNameFromDb = farmDocSnap.data()?.farmName;
        dataSummaryLines.push(`- Farm: ${farmNameFromDb || 'Unnamed'}.`);
      }

      // Fetch Fields for Acreage and Count
      const fieldsQuery = query(collection(adminDb, "fields"), where("farmId", "==", farmId));
      const fieldsSnapshot = await getDocs(fieldsQuery);
      fieldCountFromDb = fieldsSnapshot.size;
      fieldsSnapshot.docs.forEach(doc => {
        const field = doc.data();
        if (field.fieldSize && typeof field.fieldSize === 'number' && field.fieldSize > 0) {
          let sizeInAcres = field.fieldSize;
          if (field.fieldSizeUnit && field.fieldSizeUnit.toLowerCase().includes('hectare')) {
            sizeInAcres = field.fieldSize * HECTARE_TO_ACRE;
          }
          totalAcreageFromDb += sizeInAcres;
        }
      });
      if (fieldCountFromDb > 0) dataSummaryLines.push(`- ${fieldCountFromDb} fields, totaling ~${totalAcreageFromDb.toFixed(1)} acres.`);

      // Fetch Planting Logs for Crops
      const plantingLogsQuery = query(collection(adminDb, "plantingLogs"), where("farmId", "==", farmId), orderBy("plantingDate", "desc"), limit(20));
      const plantingLogsSnapshot = await getDocs(plantingLogsQuery);
      plantingLogsSnapshot.forEach(doc => recentCropsSet.add(doc.data().cropName));
      if (recentCropsSet.size > 0) dataSummaryLines.push(`- Crops recently planted: ${Array.from(recentCropsSet).join(', ')}.`);

      // Fetch Harvesting Logs for Yields
      const harvestingLogsQuery = query(collection(adminDb, "harvestingLogs"), where("farmId", "==", farmId), orderBy("harvestDate", "desc"), limit(50)); // More logs for yield avg
      const harvestingLogsSnapshot = await getDocs(harvestingLogsQuery);
      harvestingLogsSnapshot.forEach(doc => {
        const log = doc.data();
        if (log.cropName && typeof log.yieldAmount === 'number' && log.yieldAmount > 0) {
          const cropData = yieldMap.get(log.cropName) || { total: 0, count: 0, units: new Set<string>() };
          cropData.total += log.yieldAmount;
          cropData.count++;
          if(log.yieldUnit) cropData.units.add(log.yieldUnit);
          yieldMap.set(log.cropName, cropData);
        }
      });
      if (yieldMap.size > 0) {
        const yieldStrings = Array.from(yieldMap.entries()).map(([crop, data]) => 
          `${crop}: ${(data.total / data.count).toFixed(1)} ${Array.from(data.units).join('/') || 'units'}`
        );
        dataSummaryLines.push(`- Average yields from logs: ${yieldStrings.join('; ')}.`);
      }

      // Fetch Recent Soil Data
      const soilQuery = query(collection(adminDb, "soilDataLogs"), where("farmId", "==", farmId), orderBy("sampleDate", "desc"), limit(5));
      const soilSnapshot = await getDocs(soilQuery);
      soilSnapshot.forEach(doc => {
        const data = doc.data();
        let entry = `Test on ${format(parseISO(data.sampleDate), "MMM yyyy")}`;
        if(data.phLevel) entry += `, pH ${data.phLevel}`;
        if(data.organicMatter) entry += `, OM ${data.organicMatter}`;
        soilObservations.push(entry);
      });
      if (soilObservations.length > 0) dataSummaryLines.push(`- Recent soil observations: ${soilObservations.slice(0,2).join('; ')}...`);
      
      // Fetch Recent Fertilizer Applications
      const fertilizerQuery = query(collection(adminDb, "fertilizerLogs"), where("farmId", "==", farmId), orderBy("dateApplied", "desc"), limit(5));
      const fertilizerSnapshot = await getDocs(fertilizerQuery);
      fertilizerSnapshot.forEach(doc => {
          const data = doc.data();
          fertilizerApps.push(`${data.fertilizerType} (${data.amountApplied} ${data.amountUnit}) on ${format(parseISO(data.dateApplied), "MMM yyyy")}`);
      });
       if (fertilizerApps.length > 0) dataSummaryLines.push(`- Recent fertilizer apps: ${fertilizerApps.slice(0,2).join('; ')}...`);

      // Fetch Recent Irrigation Events
      const irrigationQuery = query(collection(adminDb, "irrigationLogs"), where("farmId", "==", farmId), orderBy("irrigationDate", "desc"), limit(5));
      const irrigationSnapshot = await getDocs(irrigationQuery);
      irrigationSnapshot.forEach(doc => {
          const data = doc.data();
          irrigationEvents.push(`${data.amountApplied} ${data.amountUnit} via ${data.irrigationMethod || 'unknown method'} on ${format(parseISO(data.irrigationDate), "MMM yyyy")}`);
      });
      if (irrigationEvents.length > 0) dataSummaryLines.push(`- Recent irrigation: ${irrigationEvents.slice(0,2).join('; ')}...`);
      
      // Fetch Recent Weather Logs
      const weatherQuery = query(collection(adminDb, "weatherLogs"), where("farmId", "==", farmId), orderBy("date", "desc"), limit(7));
      const weatherSnapshot = await getDocs(weatherQuery);
      weatherSnapshot.forEach(doc => {
          const data = doc.data();
          weatherNotes.push(`${format(parseISO(data.date), "MMM dd")}: ${data.conditions || ""}, Temp ${data.temperatureHigh || 'N/A'}/${data.temperatureLow || 'N/A'}°C, Precip ${data.precipitation || 0}${data.precipitationUnit || 'mm'}`);
      });
      if (weatherNotes.length > 0) dataSummaryLines.push(`- Recent weather notes: ${weatherNotes.slice(0,1).join('; ')}...`);


    } catch (e) {
      console.error("Error fetching farm data for optimization strategies:", e);
      dataSummaryLines.push("Note: An error occurred while fetching detailed farm records. Advice may be more general.");
    }

    const promptInput = {
      farmId: input.farmId,
      optimizationGoals: input.optimizationGoals,
      farmName: farmNameFromDb,
      totalAcreage: totalAcreageFromDb > 0 ? parseFloat(totalAcreageFromDb.toFixed(1)) : undefined,
      fieldCount: fieldCountFromDb > 0 ? fieldCountFromDb : undefined,
      recentCrops: recentCropsSet.size > 0 ? Array.from(recentCropsSet).join(', ') : undefined,
      averageYields: yieldMap.size > 0 ? Array.from(yieldMap.entries()).map(([crop, data]) => 
        `${crop}: ${(data.total / data.count).toFixed(1)} ${Array.from(data.units).join('/') || 'units'}`
      ).join(', ') : undefined,
      soilSummary: soilObservations.length > 0 ? soilObservations.join(". ") : undefined,
      fertilizerSummary: fertilizerApps.length > 0 ? fertilizerApps.join(". ") : undefined,
      irrigationSummary: irrigationEvents.length > 0 ? irrigationEvents.join(". ") : undefined,
      recentWeatherSummary: weatherNotes.length > 0 ? weatherNotes.join(". ") : undefined,
    };

    const {output} = await prompt(promptInput);
    
    return {
        ...output!,
        dataSummary: dataSummaryLines.length > 0 ? dataSummaryLines.join("\n") : "No specific farm data was used by the AI.",
    };
  }
);

    