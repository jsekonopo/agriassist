
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
import { format, parseISO, differenceInYears } from 'date-fns';

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
  dataSummary: z.string().optional().describe("A detailed summary of the farm data and trends considered by the AI to generate the advice."),
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
    farmProfileSummary: z.string().describe("A comprehensive summary of the farm's profile including name, size, field count, main crops, historical yields, soil conditions, fertilizer/water usage, and recent weather."),
    identifiedTrends: z.string().optional().describe("A summary of any identified trends from the farm's historical data, e.g., yield trends, soil metric changes."),
  })},
  output: {schema: SuggestOptimizationStrategiesOutputSchema.omit({dataSummary: true})},
  prompt: `You are an AI Farm Optimization Expert, providing actionable advice to farmers to improve their operations.

Based on the following comprehensive farm profile, and the farmer's specific goals if provided, suggest 3-5 key optimization strategies to improve efficiency, sustainability, and/or yields.

Farm Profile:
{{{farmProfileSummary}}}

{{#if identifiedTrends}}
Identified Trends from Historical Data:
{{{identifiedTrends}}}
{{/if}}

{{#if optimizationGoals}}
The farmer has these specific optimization goals: "{{{optimizationGoals}}}"
Please tailor your suggestions to help achieve these goals first and foremost, while also considering overall farm improvement.
{{/if}}

Consider factors such as:
- Crop rotation, diversification, and cover cropping.
- Precision agriculture techniques.
- Soil health management (organic matter improvement, pH adjustment, reduced tillage).
- Nutrient management and fertilizer application efficiency.
- Water conservation and irrigation optimization.
- Pest and disease management strategies (IPM).
- Tillage practices.
- Equipment utilization.
- Potential for new technologies or practices.
- Economic viability and sustainability.

Provide specific, practical, and actionable recommendations. Format your response as a list of strategies, clearly explaining the reasoning and potential benefits for each.
  `,
});

// Helper to analyze simple trends in numeric data over time
function analyzeNumericTrend(data: {date: Date, value: number}[], valueName: string): string | undefined {
    if (data.length < 2) return undefined;
    data.sort((a, b) => a.date.getTime() - b.date.getTime()); // Oldest to newest
    const first = data[0].value;
    const last = data[data.length - 1].value;
    const avg = data.reduce((sum, item) => sum + item.value, 0) / data.length;
    
    let trend = "stable";
    if (last > first * 1.15) trend = "increasing"; // >15% increase
    else if (last < first * 0.85) trend = "decreasing"; // >15% decrease

    return `${valueName} trend: ${trend} (recent: ${last.toFixed(1)}, avg: ${avg.toFixed(1)}, oldest: ${first.toFixed(1)}).`;
}


const suggestOptimizationStrategiesFlow = ai.defineFlow(
  {
    name: 'suggestOptimizationStrategiesFlow',
    inputSchema: SuggestOptimizationStrategiesInputSchema,
    outputSchema: SuggestOptimizationStrategiesOutputSchema,
  },
  async (input) => {
    const farmId = input.farmId;
    const dataSummaryLines: string[] = [];
    const farmProfileLines: string[] = [];
    const identifiedTrendsLines: string[] = [];

    try {
      // Fetch Farm Details
      const farmDocRef = adminDb.collection('farms').doc(farmId);
      const farmDocSnap = await farmDocRef.get();
      if (farmDocSnap.exists()) {
        const farmData = farmDocSnap.data();
        farmProfileLines.push(`- Farm Name: ${farmData?.farmName || 'Unnamed Farm'}.`);
        dataSummaryLines.push(`- Farm details: ${farmData?.farmName || 'Unnamed Farm'}.`);
      }

      // Fetch Fields for Acreage and Count
      const fieldsQuery = query(collection(adminDb, "fields"), where("farmId", "==", farmId));
      const fieldsSnapshot = await getDocs(fieldsQuery);
      const fieldCount = fieldsSnapshot.size;
      let totalAcreage = 0;
      fieldsSnapshot.docs.forEach(doc => {
        const field = doc.data();
        if (field.fieldSize && typeof field.fieldSize === 'number' && field.fieldSize > 0) {
          let sizeInAcres = field.fieldSize;
          if (field.fieldSizeUnit && field.fieldSizeUnit.toLowerCase().includes('hectare')) {
            sizeInAcres = field.fieldSize * HECTARE_TO_ACRE;
          }
          totalAcreage += sizeInAcres;
        }
      });
      if (fieldCount > 0) {
        farmProfileLines.push(`- Approximate Total Size: ${totalAcreage.toFixed(1)} acres (across ${fieldCount} fields).`);
        dataSummaryLines.push(`- ${fieldCount} fields, ~${totalAcreage.toFixed(1)} acres.`);
      }

      // Fetch Planting Logs for Crops
      const recentCropsSet = new Set<string>();
      const plantingLogsQuery = query(collection(adminDb, "plantingLogs"), where("farmId", "==", farmId), orderBy("plantingDate", "desc"), limit(50)); // Wider history for crop diversity
      const plantingLogsSnapshot = await getDocs(plantingLogsQuery);
      plantingLogsSnapshot.forEach(doc => recentCropsSet.add(doc.data().cropName));
      if (recentCropsSet.size > 0) {
        farmProfileLines.push(`- Main Crops Logged (recent & historical): ${Array.from(recentCropsSet).join(', ')}.`);
        dataSummaryLines.push(`- Crops: ${Array.from(recentCropsSet).slice(0,5).join(', ')}...`);
      }

      // Fetch Harvesting Logs for Yields & Trends
      const yieldMap = new Map<string, { yields: { year: number; amount: number }[]; units: Set<string> }>();
      const harvestingLogsQuery = query(collection(adminDb, "harvestingLogs"), where("farmId", "==", farmId), orderBy("harvestDate", "desc"), limit(100)); // Ample logs for yield trends
      const harvestingLogsSnapshot = await getDocs(harvestingLogsQuery);
      harvestingLogsSnapshot.forEach(doc => {
        const log = doc.data();
        if (log.cropName && typeof log.yieldAmount === 'number' && log.yieldAmount > 0 && log.harvestDate) {
          const year = parseISO(log.harvestDate).getFullYear();
          const cropData = yieldMap.get(log.cropName) || { yields: [], units: new Set<string>() };
          cropData.yields.push({ year, amount: log.yieldAmount });
          if(log.yieldUnit) cropData.units.add(log.yieldUnit);
          yieldMap.set(log.cropName, cropData);
        }
      });
      if (yieldMap.size > 0) {
        const yieldStrings: string[] = [];
        Array.from(yieldMap.entries()).forEach(([crop, data]) => {
            const yieldsByYear: {[year: number]: number[]} = {};
            data.yields.forEach(y => {
                if(!yieldsByYear[y.year]) yieldsByYear[y.year] = [];
                yieldsByYear[y.year].push(y.amount);
            });
            const avgYieldsByYear = Object.entries(yieldsByYear).map(([year, amounts]) => ({
                date: new Date(parseInt(year), 6, 15), // Mid-year for trend analysis
                value: amounts.reduce((s,a) => s+a,0) / amounts.length
            }));
            const overallAvg = data.yields.reduce((s,y) => s+y.amount,0) / data.yields.length;
            yieldStrings.push(`${crop}: Overall Avg ${overallAvg.toFixed(1)} ${Array.from(data.units).join('/') || 'units'}`);
            if (avgYieldsByYear.length >= 2) {
                const trend = analyzeNumericTrend(avgYieldsByYear, `${crop} yield`);
                if(trend) identifiedTrendsLines.push(`- ${trend}`);
            }
        });
        farmProfileLines.push(`- Historical Yields Summary: ${yieldStrings.join('; ')}.`);
        dataSummaryLines.push(`- Yield data for ${yieldMap.size} crops.`);
      }
      
      // Fetch Recent Soil Data & Trends
      const soilObservations: string[] = [];
      const fieldSoilData = new Map<string, {ph: {date: Date, value: number}[], om: {date: Date, value: number}[]}>();
      const soilQuery = query(collection(adminDb, "soilDataLogs"), where("farmId", "==", farmId), orderBy("sampleDate", "desc"), limit(25)); // More for trends per field
      const soilSnapshot = await getDocs(soilQuery);
      soilSnapshot.forEach(docSnap => {
        const data = docSnap.data();
        let entry = `Test on ${format(parseISO(data.sampleDate), "MMM yyyy")}`;
        if(data.phLevel) entry += `, pH ${data.phLevel}`;
        if(data.organicMatter) entry += `, OM ${data.organicMatter}`;
        if(data.fieldId) entry += ` (Field: ${data.fieldId})`;
        soilObservations.push(entry);

        if (data.fieldId && (data.phLevel !== undefined || data.organicMatter !== undefined)) {
            const fieldData = fieldSoilData.get(data.fieldId) || { ph: [], om: [] };
            const sampleDate = parseISO(data.sampleDate);
            if (data.phLevel !== undefined && typeof data.phLevel === 'number') {
                fieldData.ph.push({ date: sampleDate, value: data.phLevel });
            }
            const omString = typeof data.organicMatter === 'string' ? data.organicMatter.replace('%', '') : data.organicMatter;
            const omValue = parseFloat(omString);
            if (!isNaN(omValue)) {
                 fieldData.om.push({ date: sampleDate, value: omValue });
            }
            fieldSoilData.set(data.fieldId, fieldData);
        }
      });
      if (soilObservations.length > 0) {
        farmProfileLines.push(`- Soil Conditions Summary (recent logs): ${soilObservations.slice(0,3).join('; ')}...`);
        dataSummaryLines.push(`- ${soilObservations.length} soil tests logged.`);
        fieldSoilData.forEach((data, fieldId) => {
            if (data.ph.length >=2) {
                const trend = analyzeNumericTrend(data.ph, `pH for field ${fieldId}`);
                if(trend) identifiedTrendsLines.push(`- ${trend}`);
            }
             if (data.om.length >=2) {
                const trend = analyzeNumericTrend(data.om, `Organic Matter % for field ${fieldId}`);
                if(trend) identifiedTrendsLines.push(`- ${trend}`);
            }
        });
      }
      
      // Summaries for Fertilizer, Irrigation, Weather (limit to last few for brevity in profile)
      const fertilizerApps: string[] = [];
      const fertilizerQuery = query(collection(adminDb, "fertilizerLogs"), where("farmId", "==", farmId), orderBy("dateApplied", "desc"), limit(5));
      const fertilizerSnapshot = await getDocs(fertilizerQuery);
      fertilizerSnapshot.forEach(docSnap => fertilizerApps.push(`${docSnap.data().fertilizerType} on ${format(parseISO(docSnap.data().dateApplied), "MMM yyyy")}`));
      if(fertilizerApps.length > 0) farmProfileLines.push(`- Recent Fertilizer Usage: ${fertilizerApps.slice(0,2).join('; ')}...`);
      
      const irrigationEvents: string[] = [];
      const irrigationQuery = query(collection(adminDb, "irrigationLogs"), where("farmId", "==", farmId), orderBy("irrigationDate", "desc"), limit(5));
      const irrigationSnapshot = await getDocs(irrigationQuery);
      irrigationSnapshot.forEach(docSnap => irrigationEvents.push(`${docSnap.data().amountApplied} ${docSnap.data().amountUnit || ''} on ${format(parseISO(docSnap.data().irrigationDate), "MMM yyyy")}`));
      if(irrigationEvents.length > 0) farmProfileLines.push(`- Recent Irrigation: ${irrigationEvents.slice(0,2).join('; ')}...`);
      
      const weatherNotes: string[] = [];
      const weatherQuery = query(collection(adminDb, "weatherLogs"), where("farmId", "==", farmId), orderBy("date", "desc"), limit(7));
      const weatherSnapshot = await getDocs(weatherQuery);
      weatherSnapshot.forEach(docSnap => weatherNotes.push(`${format(parseISO(docSnap.data().date), "MMM dd")}: ${docSnap.data().conditions || ""}, Temp ${docSnap.data().temperatureHigh ?? 'N/A'}/${docSnap.data().temperatureLow ?? 'N/A'}°C`));
      if(weatherNotes.length > 0) farmProfileLines.push(`- Recent Weather Context: ${weatherNotes.slice(0,2).join('; ')}...`);
      
      dataSummaryLines.push(`- Considered ${fertilizerApps.length} fertilizer, ${irrigationEvents.length} irrigation, ${weatherNotes.length} weather logs.`);

    } catch (e) {
      console.error("Error fetching farm data for optimization strategies:", e);
      farmProfileLines.push("Note: An error occurred while fetching detailed farm records for the profile. Advice may be more general.");
      dataSummaryLines.push("Error fetching some farm data.");
    }

    const farmProfileSummary = farmProfileLines.length > 0 ? farmProfileLines.join("\n") : "Basic farm profile could not be fully constructed.";
    const identifiedTrendsSummary = identifiedTrendsLines.length > 0 ? identifiedTrendsLines.join("\n") : undefined;

    const promptInputForAI = {
      farmId: input.farmId,
      optimizationGoals: input.optimizationGoals,
      farmProfileSummary,
      identifiedTrends: identifiedTrendsSummary,
    };

    const {output} = await prompt(promptInputForAI);
    
    return {
        ...output!,
        dataSummary: dataSummaryLines.join("\n"),
    };
  }
);

