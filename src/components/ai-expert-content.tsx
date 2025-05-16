"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiAskForm } from "./forms/ai-ask-form";
import { AiTreatmentForm } from "./forms/ai-treatment-form";
import { AiOptimizationForm } from "./forms/ai-optimization-form";
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
    value: "treatment",
    label: "Treatment Plan",
    icon: Icons.Planting,
    description: "Get AI recommendations for crop diseases or pest infestations.",
    formComponent: AiTreatmentForm,
  },
  {
    value: "optimization",
    label: "Optimization Strategies",
    icon: Icons.Analytics,
    description: "Receive AI-powered suggestions to optimize your farm operations.",
    formComponent: AiOptimizationForm,
  },
];

export function AiExpertContent() {
  return (
    <Tabs defaultValue="ask" className="w-full">
      <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 mb-6">
        {aiTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2 text-sm md:text-base">
            <tab.icon className="h-4 w-4 md:h-5 md:w-5" />
            {tab.label}
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
