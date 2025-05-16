
// src/ai/flows/proactive-farm-insights-flow.tsx
'use server';
/**
 * @fileOverview AI flow to proactively identify upcoming opportunities or risks for a farm.
 *
 * - proactiveFarmInsights - A function that provides proactive insights.
 * - ProactiveFarmInsightsInput - The input type for the function.
 * - ProactiveFarmInsightsOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { adminDb } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { format, parseISO, addDays, isWithinInterval } from 'date-fns';

const ProactiveFarmInsightsInputSchema = z.object({
  farmId: z.string().describe("The ID of the farm for which to generate insights."),
  daysToLookAhead: z.number().optional().default(14).describe("Number of days to look ahead for tasks or potential weather impacts."),
});
export type ProactiveFarmInsightsInput = z.infer<typeof ProactiveFarmInsightsInputSchema>;

const ProactiveFarmInsightsOutputSchema = z.object({
  identifiedOpportunities: z.string().optional().describe("1-2 key potential opportunities identified from recent data (e.g., optimal timing based on weather, market trend alignment). Formatted clearly, use Markdown if possible."),
  identifiedRisks: z.string().optional().describe("1-2 key potential risks identified (e.g., upcoming pest pressure based on weather, overdue critical tasks, potential nutrient imbalance based on recent soil tests and crops). Formatted clearly, use Markdown if possible."),
  dataConsideredSummary: z.string().describe("A brief summary of the types of data considered by the AI (e.g., upcoming tasks, recent weather patterns, last soil tests for active fields)."),
});
export type ProactiveFarmInsightsOutput = z.infer<typeof ProactiveFarmInsightsOutputSchema>;

export async function proactiveFarmInsights(input: ProactiveFarmInsightsInput): Promise<ProactiveFarmInsightsOutput> {
  return proactiveFarmInsightsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'proactiveFarmInsightsPrompt',
  input: {schema: ProactiveFarmInsightsInputSchema.extend({
    upcomingTasksSummary: z.string().optional(),
    recentWeatherSummary: z.string().optional(),
    recentSoilTestsSummary: z.string().optional(),
    activePlantingsSummary: z.string().optional(),
  })},
  output: {schema: ProactiveFarmInsightsOutputSchema.omit({ dataConsideredSummary: true })},
  prompt: `You are an AI Farm Advisor. Your goal is to analyze a snapshot of recent farm data and identify 1-2 potential upcoming opportunities and 1-2 potential upcoming risks for the farmer for the next approximately {{{daysToLookAhead}}} days. Be concise and actionable.

Farm Data Snapshot:
{{#if upcomingTasksSummary}}- Upcoming Tasks (due in next {{{daysToLookAhead}}} days or overdue): {{{upcomingTasksSummary}}}{{/if}}
{{#if recentWeatherSummary}}- Recent Weather (last 7 days): {{{recentWeatherSummary}}}{{/if}}
{{#if recentSoilTestsSummary}}- Recent Soil Tests (for actively planted fields): {{{recentSoilTestsSummary}}}{{/if}}
{{#if activePlantingsSummary}}- Current Active Plantings: {{{activePlantingsSummary}}}{{/if}}

Analysis Required:
1.  Identify 1-2 potential **Opportunities** based on the data. Examples:
    *   Favorable weather window for a specific task (planting, spraying, harvesting).
    *   Optimal timing for fertilizer application based on crop stage and soil data.
    *   Early signs of good crop development.
2.  Identify 1-2 potential **Risks** based on the data. Examples:
    *   Pest or disease pressure indicated by weather patterns for current crops.
    *   Overdue critical tasks that could impact yield or operations.
    *   Potential nutrient deficiencies given current crops and last soil tests.
    *   Unfavorable weather forecast impacting sensitive operations.

Provide a brief, actionable insight for each. If no significant opportunities or risks are apparent from the provided snapshot, state that.
Format your response according to the output schema.
  `,
});

const proactiveFarmInsightsFlow = ai.defineFlow(
  {
    name: 'proactiveFarmInsightsFlow',
    inputSchema: ProactiveFarmInsightsInputSchema,
    outputSchema: ProactiveFarmInsightsOutputSchema,
  },
  async (input) => {
    const farmId = input.farmId;
    const daysAhead = input.daysToLookAhead || 14;
    const lookAheadDate = addDays(new Date(), daysAhead);
    const dataSummaryLines: string[] = [];

    let upcomingTasksSummary: string | undefined;
    try {
      const tasksQuery = query(
        collection(adminDb, "taskLogs"),
        where("farmId", "==", farmId),
        where("status", "!=", "Done"),
        orderBy("dueDate", "asc")
      );
      const tasksSnapshot = await getDocs(tasksQuery);
      const relevantTasks: string[] = [];
      tasksSnapshot.forEach(doc => {
        const task = doc.data();
        if (task.dueDate) {
          const dueDate = parseISO(task.dueDate);
          if (isWithinInterval(dueDate, { start: new Date(), end: lookAheadDate }) || dueDate < new Date()) { // Due soon or overdue
            relevantTasks.push(`${task.taskName} (Due: ${format(dueDate, "MMM dd")}${dueDate < new Date() ? ' - OVERDUE' : ''})`);
          }
        } else { // No due date, might be relevant
            relevantTasks.push(`${task.taskName} (No due date)`);
        }
      });
      if (relevantTasks.length > 0) {
        upcomingTasksSummary = relevantTasks.slice(0, 5).join("; "); // Limit for prompt brevity
        dataSummaryLines.push("Considered upcoming/overdue tasks.");
      }
    } catch (e) { console.error("Error fetching tasks for proactive insights:", e); }

    let recentWeatherSummary: string | undefined;
    try {
      const weatherQuery = query(collection(adminDb, "weatherLogs"), where("farmId", "==", farmId), orderBy("date", "desc"), limit(7));
      const weatherSnapshot = await getDocs(weatherQuery);
      const weatherNotes: string[] = [];
      weatherSnapshot.forEach(doc => {
        const data = doc.data();
        weatherNotes.push(`${format(parseISO(data.date), "MMM dd")}: ${data.conditions}, Temp ${data.temperatureHigh ?? 'N/A'}/${data.temperatureLow ?? 'N/A'}°C`);
      });
      if (weatherNotes.length > 0) {
        recentWeatherSummary = weatherNotes.join("; ");
        dataSummaryLines.push("Considered recent weather logs.");
      }
    } catch (e) { console.error("Error fetching weather for proactive insights:", e); }

    let recentSoilTestsSummary: string | undefined;
    try {
      const soilQuery = query(collection(adminDb, "soilDataLogs"), where("farmId", "==", farmId), orderBy("sampleDate", "desc"), limit(5));
      const soilSnapshot = await getDocs(soilQuery);
      const soilNotes: string[] = [];
      soilSnapshot.forEach(doc => {
        const data = doc.data();
        soilNotes.push(`Field ${data.fieldId || 'Unknown'}: pH ${data.phLevel ?? 'N/A'}, OM ${data.organicMatter ?? 'N/A'} (Date: ${format(parseISO(data.sampleDate), "MMM yyyy")})`);
      });
      if (soilNotes.length > 0) {
        recentSoilTestsSummary = soilNotes.join("; ");
        dataSummaryLines.push("Considered recent soil tests.");
      }
    } catch (e) { console.error("Error fetching soil data for proactive insights:", e); }
    
    let activePlantingsSummary: string | undefined;
    try {
      const plantingQuery = query(collection(adminDb, "plantingLogs"), where("farmId", "==", farmId), orderBy("plantingDate", "desc"), limit(10));
      const plantingSnapshot = await getDocs(plantingQuery);
      const crops = new Set<string>();
      plantingSnapshot.forEach(doc => crops.add(`${doc.data().cropName} (Planted: ${format(parseISO(doc.data().plantingDate), "MMM yyyy")})`));
      if (crops.size > 0) {
        activePlantingsSummary = Array.from(crops).join("; ");
        dataSummaryLines.push("Considered active plantings.");
      }
    } catch (e) { console.error("Error fetching plantings for proactive insights:", e); }


    const promptInputForAI = {
      farmId,
      daysToLookAhead,
      upcomingTasksSummary,
      recentWeatherSummary,
      recentSoilTestsSummary,
      activePlantingsSummary,
    };

    const {output} = await prompt(promptInputForAI);
    
    return {
      ...output!,
      dataConsideredSummary: dataSummaryLines.length > 0 ? dataSummaryLines.join(" ") : "No specific recent data was available to form detailed insights.",
    };
  }
);
