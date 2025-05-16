
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "./icons"; 
import type { LucideIcon } from "lucide-react";
import { AddAnimalForm } from "./forms/add-animal-form";
import { AnimalRegistryTable } from "./data-management/animal-registry-table";
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

// Define roles that can add new animal records
const ownerRoles: UserRole[] = ['free', 'pro', 'agribusiness'];
const rolesThatCanAddAnimal: UserRole[] = [...ownerRoles, 'admin', 'editor'];


const livestockTabs: LivestockTab[] = [
  {
    value: "registry",
    label: "Animal Registry",
    icon: Icons.ClipboardList, // Using ClipboardList for registry
    description: "Add, view, and manage individual animal records.",
    formComponent: AddAnimalForm,
    tableComponent: AnimalRegistryTable,
    requiredRolesForAdd: rolesThatCanAddAnimal,
  },
  // Future tabs like Health Records, Breeding Records will go here
  // {
  //   value: "health",
  //   label: "Health Records",
  //   icon: Icons.HeartPulse, // Example, add if needed
  //   description: "Log and track animal health events, vaccinations, and treatments.",
  //   // formComponent: AddHealthRecordForm,
  //   // tableComponent: HealthRecordsTable,
  //   // requiredRolesForAdd: rolesThatCanAddAnimal,
  // },
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

  return (
    <Tabs defaultValue="registry" className="w-full">
      <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 mb-6 gap-1 h-auto">
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
                  <h3 className="text-xl font-semibold mb-4">Registered Animals</h3>
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
