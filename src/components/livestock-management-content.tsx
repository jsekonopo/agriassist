
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "./icons"; 
import type { LucideIcon } from "lucide-react";
import { AddAnimalForm } from "./forms/add-animal-form";
import { AnimalRegistryTable } from "./data-management/animal-registry-table";
import { AddHealthRecordForm } from "./forms/add-health-record-form";
import { HealthRecordsTable } from "./data-management/health-records-table";
import { AddBreedingRecordForm } from "./forms/add-breeding-record-form";
import { BreedingRecordsTable } from "./data-management/breeding-records-table";
import { AddFeedLogForm } from "./forms/add-feed-log-form"; // New
import { FeedLogTable } from "./data-management/feed-log-table"; // New
import { AddWeightLogForm } from "./forms/add-weight-log-form"; // New
import { WeightLogTable } from "./data-management/weight-log-table"; // New
import { Separator } from "@/components/ui/separator";
import { useAuth, type UserRole } from "@/contexts/auth-context"; 

interface LivestockTab {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
  formComponent?: React.ElementType<{ onLogSaved?: () => void }>;
  tableComponent?: React.ElementType<{ refreshTrigger: number, onLogDeleted: () => void }>;
  requiredRolesForAdd?: UserRole[];
}

const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanAdd: UserRole[] = [...ownerRoles, 'admin', 'editor'];


const livestockTabs: LivestockTab[] = [
  {
    value: "registry",
    label: "Animal Registry",
    icon: Icons.ClipboardList, 
    description: "Add, view, and manage individual animal records.",
    formComponent: AddAnimalForm,
    tableComponent: AnimalRegistryTable,
    requiredRolesForAdd: rolesThatCanAdd,
  },
  {
    value: "health",
    label: "Health Records",
    icon: Icons.HealthRecord, 
    description: "Log and track animal health events, vaccinations, and treatments.",
    formComponent: AddHealthRecordForm,
    tableComponent: HealthRecordsTable,
    requiredRolesForAdd: rolesThatCanAdd,
  },
  {
    value: "breeding",
    label: "Breeding Records",
    icon: Icons.Breeding, 
    description: "Track mating, pregnancies, births, and offspring details.",
    formComponent: AddBreedingRecordForm,
    tableComponent: BreedingRecordsTable,
    requiredRolesForAdd: rolesThatCanAdd,
  },
  {
    value: "feed",
    label: "Feed Logs",
    icon: Icons.FeedLog, 
    description: "Record feed consumption for individual animals or groups.",
    formComponent: AddFeedLogForm,
    tableComponent: FeedLogTable,
    requiredRolesForAdd: rolesThatCanAdd,
  },
  {
    value: "weight",
    label: "Weight Logs",
    icon: Icons.WeightLog, 
    description: "Track animal weights over time for growth monitoring.",
    formComponent: AddWeightLogForm,
    tableComponent: WeightLogTable,
    requiredRolesForAdd: rolesThatCanAdd,
  },
];

export function LivestockManagementContent() {
  const [logRefreshTrigger, setLogRefreshTrigger] = useState(0);
  const { user } = useAuth();

  const handleLogSaved = () => {
    setLogRefreshTrigger(prev => prev + 1);
  };
  
  const canUserAdd = (tab: LivestockTab): boolean => {
    if (!user || !user.roleOnCurrentFarm) return false;
    if (!tab.requiredRolesForAdd) return true; 
    return tab.requiredRolesForAdd.includes(user.roleOnCurrentFarm);
  };

  const gridColsClass = () => {
    const count = livestockTabs.length;
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2";
    if (count === 3) return "grid-cols-1 sm:grid-cols-3"; 
    if (count === 4) return "grid-cols-2 md:grid-cols-4";
    if (count === 5) return "grid-cols-2 sm:grid-cols-3 md:grid-cols-5";
    return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"; // Default for many tabs
  };

  return (
    <Tabs defaultValue="registry" className="w-full">
      <TabsList className={`grid w-full ${gridColsClass()} mb-6 gap-1 h-auto`}>
        {livestockTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm py-2 px-1 sm:px-3 h-auto min-h-[40px] sm:h-10">
            <tab.icon className="h-4 w-4 flex-shrink-0" />
            <span className="text-center sm:text-left">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {livestockTabs.map((tab) => (
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
              {tab.formComponent && (
                canUserAdd(tab) ? (
                  <tab.formComponent onLogSaved={handleLogSaved} />
                ) : (
                  <p className="text-muted-foreground">You do not have permission to add new {tab.label.toLowerCase()} records.</p>
                )
              )}
              {tab.tableComponent && (
                <>
                  {tab.formComponent && <Separator className="my-8" />}
                  <h3 className="text-xl font-semibold mb-4">Logged Entries</h3>
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
