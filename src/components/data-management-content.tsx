"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlantingLogForm } from "./forms/planting-log-form";
import { HarvestingLogForm } from "./forms/harvesting-log-form";
import { SoilDataForm } from "./forms/soil-data-form";
import { WeatherDataForm } from "./forms/weather-data-form";
import { Icons } from "./icons"; // Assuming you have an Icons component
import type { LucideIcon } from "lucide-react";

interface DataTab {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
  formComponent: React.ElementType;
}

const dataTabs: DataTab[] = [
  {
    value: "planting",
    label: "Planting Logs",
    icon: Icons.Planting,
    description: "Record details about your planting activities.",
    formComponent: PlantingLogForm,
  },
  {
    value: "harvesting",
    label: "Harvesting Logs",
    icon: Icons.Harvesting,
    description: "Keep track of your harvest yields and observations.",
    formComponent: HarvestingLogForm,
  },
  {
    value: "soil",
    label: "Soil Data",
    icon: Icons.Soil,
    description: "Manage soil test results and treatments.",
    formComponent: SoilDataForm,
  },
  {
    value: "weather",
    label: "Weather Logs",
    icon: Icons.Weather,
    description: "Log local weather conditions and observations.",
    formComponent: WeatherDataForm,
  },
];

export function DataManagementContent() {
  return (
    <Tabs defaultValue="planting" className="w-full">
      <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
        {dataTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {dataTabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <tab.icon className="h-6 w-6 text-primary" />
                {tab.label}
              </CardTitle>
              <CardDescription>{tab.description}</CardDescription>
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
