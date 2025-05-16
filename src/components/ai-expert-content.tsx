"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiAskForm } from "./forms/ai-ask-form";
import { AiTreatmentForm } from "./forms/ai-treatment-form";
import { AiOptimizationForm } from "./forms/ai-optimization-form";
import { AiPlantDiagnosisForm } from "./forms/ai-plant-diagnosis-form";
import { AiPlantingHarvestingForm } from "./forms/ai-planting-harvesting-form"; // Added
import { AiSustainablePracticesForm } from "./forms/ai-sustainable-practices-form"; // Added
import { AiSoilInterpretationForm } from "./forms/ai-soil-interpretation-form"; // Added
import { Icons } from "./icons";
import type { LucideIcon } from "lucide-react";

interface AiTab {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
  formComponent: React.ElementType;
}

const aiTabs: AiTab[] = [
  {
    value: "ask",
    label: "Ask Expert",
    icon: Icons.Help,
    description: "Ask simple 'how to' questions related to farming.",
    formComponent: AiAskForm,
  },
  {
    value: "plant_diagnosis",
    label: "Plant Diagnosis",
    icon: Icons.Camera,
    description: "Upload a photo and describe symptoms to diagnose plant health issues.",
    formComponent: AiPlantDiagnosisForm,
  },
  {
    value: "treatment",
    label: "Treatment Plan",
    icon: Icons.Planting,
    description: "Get AI recommendations for crop diseases or pest infestations based on symptoms.",
    formComponent: AiTreatmentForm,
  },
  {
    value: "optimization",
    label: "Optimization Strategies",
    icon: Icons.Analytics,
    description: "Receive AI-powered suggestions to optimize your farm operations.",
    formComponent: AiOptimizationForm,
  },
  {
    value: "planting_harvesting",
    label: "Timing Advice",
    icon: Icons.Calendar,
    description: "Get AI advice on optimal planting or harvesting windows for your crops.",
    formComponent: AiPlantingHarvestingForm,
  },
  {
    value: "sustainable_practices",
    label: "Sustainability",
    icon: Icons.Recycle,
    description: "Receive AI recommendations for sustainable farming practices.",
    formComponent: AiSustainablePracticesForm,
  },
  {
    value: "soil_interpretation",
    label: "Soil Insights",
    icon: Icons.FlaskConical,
    description: "Get AI interpretation of your soil test results and recommendations.",
    formComponent: AiSoilInterpretationForm,
  },
];

export function AiExpertContent() {
  // Determine number of columns for the TabsList based on number of tabs
  const gridColsClass = () => {
    const count = aiTabs.length;
    if (count <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 3) return "grid-cols-1 sm:grid-cols-3";
    if (count <= 4) return "grid-cols-2 md:grid-cols-4";
    // For 5 to 7 tabs, use 3 columns on small, adjust for md and lg if needed
    // This example will use a flexible approach that wraps.
    // For a fixed grid, you might need more specific classes or adjust tab label length.
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"; // Example for many tabs
  };


  return (
    <Tabs defaultValue="ask" className="w-full">
      <TabsList className={`grid w-full ${gridColsClass()} mb-6 gap-1`}>
        {aiTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 px-1 sm:px-3 h-auto sm:h-10">
            <tab.icon className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="text-center sm:text-left">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {aiTabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
                <tab.icon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                {tab.label}
              </CardTitle>
              <CardDescription className="text-sm md:text-base">{tab.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <tab.formComponent />
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
