
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlantingLogForm } from "./forms/planting-log-form";
import { HarvestingLogForm } from "./forms/harvesting-log-form";
import { SoilDataForm } from "./forms/soil-data-form";
import { WeatherDataForm } from "./forms/weather-data-form";
import { FieldDefinitionForm } from "./forms/field-definition-form";
import { TaskLogForm } from "./forms/task-log-form"; // Added TaskLogForm
import { Icons } from "./icons"; 
import type { LucideIcon } from "lucide-react";
import { PlantingLogTable } from "./data-management/planting-log-table";
import { HarvestingLogTable } from "./data-management/harvesting-log-table";
import { SoilDataLogTable } from "./data-management/soil-data-log-table";
import { WeatherDataLogTable } from "./data-management/weather-data-log-table";
import { FieldDefinitionTable } from "./data-management/field-definition-table";
import { TaskLogTable } from "./data-management/task-log-table"; // Added TaskLogTable
import { Separator } from "@/components/ui/separator";

interface DataTab {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
  formComponent: React.ElementType<{ onLogSaved?: () => void }>;
  tableComponent?: React.ElementType<{ refreshTrigger: number, onLogDeleted: () => void }>;
}

const dataTabs: DataTab[] = [
   {
    value: "fields",
    label: "Fields",
    icon: Icons.Location,
    description: "Define and manage your farm fields.",
    formComponent: FieldDefinitionForm,
    tableComponent: FieldDefinitionTable,
  },
  {
    value: "planting",
    label: "Planting", // Shortened label
    icon: Icons.Planting,
    description: "Record and view details about your planting activities.",
    formComponent: PlantingLogForm,
    tableComponent: PlantingLogTable,
  },
  {
    value: "harvesting",
    label: "Harvesting", // Shortened label
    icon: Icons.Harvesting,
    description: "Keep track of your harvest yields and observations.",
    formComponent: HarvestingLogForm,
    tableComponent: HarvestingLogTable,
  },
  {
    value: "soil",
    label: "Soil", // Shortened label
    icon: Icons.Soil,
    description: "Manage soil test results and treatments.",
    formComponent: SoilDataForm,
    tableComponent: SoilDataLogTable,
  },
  {
    value: "weather",
    label: "Weather", // Shortened label
    icon: Icons.Weather,
    description: "Log local weather conditions and observations.",
    formComponent: WeatherDataForm,
    tableComponent: WeatherDataLogTable,
  },
  {
    value: "tasks",
    label: "Tasks",
    icon: Icons.ClipboardList, // Using ClipboardList icon
    description: "Manage and track farm tasks and activities.",
    formComponent: TaskLogForm,
    tableComponent: TaskLogTable,
  },
];

export function DataManagementContent() {
  const [logRefreshTrigger, setLogRefreshTrigger] = useState(0);

  const handleLogSaved = () => {
    setLogRefreshTrigger(prev => prev + 1);
  };

  return (
    <Tabs defaultValue="fields" className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 mb-6"> {/* Adjusted for 6 tabs */}
        {dataTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2 text-xs sm:text-sm">
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
              <tab.formComponent onLogSaved={handleLogSaved} />
              {tab.tableComponent && (
                <>
                  <Separator className="my-8" />
                  <h3 className="text-xl font-semibold mb-4">Recorded Entries</h3>
                  <tab.tableComponent refreshTrigger={logRefreshTrigger} onLogDeleted={handleLogSaved} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
