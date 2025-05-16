
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlantingLogForm } from "./forms/planting-log-form";
import { HarvestingLogForm } from "./forms/harvesting-log-form";
import { SoilDataForm } from "./forms/soil-data-form";
import { WeatherDataForm } from "./forms/weather-data-form";
import { FieldDefinitionForm } from "./forms/field-definition-form";
import { TaskLogForm } from "./forms/task-log-form";
import { FertilizerLogForm } from "./forms/fertilizer-log-form";
import { IrrigationLogForm } from "./forms/irrigation-log-form";
import { FarmInputLogForm } from "./forms/farm-input-log-form";
import { FarmEquipmentForm } from "./forms/farm-equipment-form"; // Added
import { Icons } from "./icons"; 
import type { LucideIcon } from "lucide-react";
import { PlantingLogTable } from "./data-management/planting-log-table";
import { HarvestingLogTable } from "./data-management/harvesting-log-table";
import { SoilDataLogTable } from "./data-management/soil-data-log-table";
import { WeatherDataLogTable } from "./data-management/weather-data-log-table";
import { FieldDefinitionTable } from "./data-management/field-definition-table";
import { TaskLogTable } from "./data-management/task-log-table";
import { FertilizerLogTable } from "./data-management/fertilizer-log-table";
import { IrrigationLogTable } from "./data-management/irrigation-log-table";
import { FarmInputLogTable } from "./data-management/farm-input-log-table";
import { FarmEquipmentTable } from "./data-management/farm-equipment-table"; // Added
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
    label: "Planting",
    icon: Icons.Planting,
    description: "Record and view details about your planting activities.",
    formComponent: PlantingLogForm,
    tableComponent: PlantingLogTable,
  },
  {
    value: "harvesting",
    label: "Harvesting",
    icon: Icons.Harvesting,
    description: "Keep track of your harvest yields and observations.",
    formComponent: HarvestingLogForm,
    tableComponent: HarvestingLogTable,
  },
  {
    value: "inputs",
    label: "Inputs",
    icon: Icons.InputsInventory,
    description: "Manage your inventory of farm inputs like seeds, fertilizers, and pesticides.",
    formComponent: FarmInputLogForm,
    tableComponent: FarmInputLogTable,
  },
  {
    value: "equipment", // Added Equipment tab
    label: "Equipment",
    icon: Icons.Tractor, // Using Tractor icon
    description: "Log and track your farm machinery and basic maintenance.",
    formComponent: FarmEquipmentForm,
    tableComponent: FarmEquipmentTable,
  },
  {
    value: "fertilizer",
    label: "Fertilizer App.",
    icon: Icons.FertilizerLog,
    description: "Log fertilizer applications and details.",
    formComponent: FertilizerLogForm,
    tableComponent: FertilizerLogTable,
  },
  {
    value: "irrigation", 
    label: "Irrigation",
    icon: Icons.Water, 
    description: "Log water usage and irrigation activities.",
    formComponent: IrrigationLogForm,
    tableComponent: IrrigationLogTable,
  },
  {
    value: "soil",
    label: "Soil",
    icon: Icons.Soil,
    description: "Manage soil test results and treatments.",
    formComponent: SoilDataForm,
    tableComponent: SoilDataLogTable,
  },
  {
    value: "weather",
    label: "Weather",
    icon: Icons.Weather,
    description: "Log local weather conditions and observations.",
    formComponent: WeatherDataForm,
    tableComponent: WeatherDataLogTable,
  },
  {
    value: "tasks",
    label: "Tasks",
    icon: Icons.ClipboardList,
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
  
  const gridColsClass = () => {
    const count = dataTabs.length;
    if (count <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 3) return "grid-cols-1 sm:grid-cols-3";
    if (count <= 4) return "grid-cols-2 md:grid-cols-4";
    if (count <= 5) return "grid-cols-2 sm:grid-cols-3 md:grid-cols-5";
    return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  };


  return (
    <Tabs defaultValue="fields" className="w-full">
      <TabsList className={`grid w-full ${gridColsClass()} mb-6 gap-1 h-auto`}>
        {dataTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 px-1 sm:px-3 h-auto min-h-[40px] sm:h-10">
            <tab.icon className="h-4 w-4 flex-shrink-0" />
            <span className="text-center sm:text-left">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {dataTabs.map((tab) => (
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
