
"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from 'next/navigation';
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
import { FarmEquipmentForm } from "./forms/farm-equipment-form";
import { ExpenseLogForm } from "./forms/expense-log-form";
import { RevenueLogForm } from "./forms/revenue-log-form";
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
import { FarmEquipmentTable } from "./data-management/farm-equipment-table";
import { ExpenseLogTable } from "./data-management/expense-log-table";
import { RevenueLogTable } from "./data-management/revenue-log-table";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth-context"; 
import type { UserRole } from "@/contexts/auth-context"; 

interface DataTab {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
  formComponent: React.ElementType<{ onLogSaved?: () => void; editingFieldId?: string | null; onFormActionComplete?: () => void; }>;
  tableComponent?: React.ElementType<{ refreshTrigger: number, onLogDeleted: () => void; onEditField?: (fieldId: string) => void; }>;
  requiredRolesForAdd?: UserRole[]; 
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const adminRoles: UserRole[] = ['admin'];
const editorRoles: UserRole[] = ['editor'];

const allDataManagementRoles: UserRole[] = [...ownerRoles, ...adminRoles, ...editorRoles];


const dataTabs: DataTab[] = [
   {
    value: "fields",
    label: "Fields",
    icon: Icons.Location,
    description: "Define and manage your farm fields, including boundaries.",
    formComponent: FieldDefinitionForm,
    tableComponent: FieldDefinitionTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "planting",
    label: "Planting",
    icon: Icons.Planting,
    description: "Record and view details about your planting activities.",
    formComponent: PlantingLogForm,
    tableComponent: PlantingLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "harvesting",
    label: "Harvesting",
    icon: Icons.Harvesting,
    description: "Keep track of your harvest yields and observations.",
    formComponent: HarvestingLogForm,
    tableComponent: HarvestingLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "inputs",
    label: "Inputs",
    icon: Icons.InputsInventory,
    description: "Manage your inventory of farm inputs like seeds, fertilizers, and pesticides.",
    formComponent: FarmInputLogForm,
    tableComponent: FarmInputLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "equipment",
    label: "Equipment",
    icon: Icons.Tractor,
    description: "Log and track your farm machinery and basic maintenance.",
    formComponent: FarmEquipmentForm,
    tableComponent: FarmEquipmentTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "fertilizer",
    label: "Fertilizer App.",
    icon: Icons.FertilizerLog,
    description: "Log fertilizer applications and details.",
    formComponent: FertilizerLogForm,
    tableComponent: FertilizerLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "irrigation", 
    label: "Irrigation",
    icon: Icons.Water, 
    description: "Log water usage and irrigation activities.",
    formComponent: IrrigationLogForm,
    tableComponent: IrrigationLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "soil",
    label: "Soil",
    icon: Icons.Soil,
    description: "Manage soil test results and treatments.",
    formComponent: SoilDataForm,
    tableComponent: SoilDataLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "weather",
    label: "Weather",
    icon: Icons.Weather,
    description: "Log local weather conditions and observations.",
    formComponent: WeatherDataForm,
    tableComponent: WeatherDataLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "tasks",
    label: "Tasks",
    icon: Icons.ClipboardList,
    description: "Manage and track farm tasks and activities.",
    formComponent: TaskLogForm,
    tableComponent: TaskLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "expenses",
    label: "Expenses",
    icon: Icons.Expenses,
    description: "Log and track your farm expenses.",
    formComponent: ExpenseLogForm,
    tableComponent: ExpenseLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
  {
    value: "revenue",
    label: "Revenue",
    icon: Icons.Dollar,
    description: "Log and track your farm revenue.",
    formComponent: RevenueLogForm,
    tableComponent: RevenueLogTable,
    requiredRolesForAdd: allDataManagementRoles,
  },
];

export function DataManagementContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || "fields";
  const [logRefreshTrigger, setLogRefreshTrigger] = useState(0);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const { user } = useAuth(); 

  const handleLogSaved = () => {
    setLogRefreshTrigger(prev => prev + 1);
  };

  const handleStartEditField = (fieldId: string) => {
    setEditingFieldId(fieldId);
    // Potentially switch to the "fields" tab if not already there, or scroll to form
  };

  const handleFormActionComplete = () => {
    setEditingFieldId(null); // Clear editing mode
    handleLogSaved(); // Refresh table
  };
  
  const gridColsClass = useMemo(() => {
    const count = dataTabs.length;
    if (count <= 2) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 4) return "grid-cols-2 md:grid-cols-4";
    if (count <= 6) return "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"; 
    return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
  }, []);

  const canUserAdd = (tab: DataTab): boolean => {
    if (!user || !user.roleOnCurrentFarm) return false;
    if (!tab.requiredRolesForAdd) return true; 
    return tab.requiredRolesForAdd.includes(user.roleOnCurrentFarm);
  };

  return (
    <Tabs defaultValue={initialTab} className="w-full" onValueChange={() => setEditingFieldId(null)}> {/* Reset editing mode on tab change */}
      <TabsList className={`grid w-full ${gridColsClass} mb-6 gap-1 h-auto`}>
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
                {tab.label} {tab.value === "fields" && editingFieldId ? "(Editing Field)" : ""}
              </CardTitle>
              <CardDescription className="text-sm md:text-base">{tab.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {canUserAdd(tab) ? (
                 tab.value === "fields" ? (
                    <tab.formComponent 
                        onLogSaved={handleLogSaved} 
                        editingFieldId={editingFieldId} 
                        onFormActionComplete={handleFormActionComplete} 
                    />
                  ) : (
                    <tab.formComponent onLogSaved={handleLogSaved} />
                  )
              ) : (
                <p className="text-muted-foreground">You do not have permission to add new {tab.label.toLowerCase()} records.</p>
              )}
              {tab.tableComponent && (
                <>
                  <Separator className="my-8" />
                  <h3 className="text-xl font-semibold mb-4">Recorded Entries</h3>
                   {tab.value === "fields" ? (
                    <tab.tableComponent 
                        refreshTrigger={logRefreshTrigger} 
                        onLogDeleted={handleLogSaved} 
                        onEditField={handleStartEditField}
                    />
                   ) : (
                     <tab.tableComponent refreshTrigger={logRefreshTrigger} onLogDeleted={handleLogSaved} />
                   )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
