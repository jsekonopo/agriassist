
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Icons } from "../icons";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, Timestamp } from "firebase/firestore";

interface AnimalOption {
  id: string; // Firestore document ID of the animal
  animalIdTag: string;
}

const healthEventTypes = [
  "Vaccination", "Treatment", "Observation", "Deworming", 
  "Injury", "Check-up", "Birth Event", "Weaning", "Other"
] as const;

const addHealthRecordSchema = z.object({
  animalDocId: z.string().min(1, "Animal selection is required."),
  logDate: z.date({ required_error: "Log date is required." }),
  eventType: z.enum(healthEventTypes, { required_error: "Event type is required." }),
  details: z.string().min(1, "Details are required.").max(1000, "Details max 1000 chars."),
  medicationAdministered: z.string().max(200).optional(),
  dosage: z.string().max(100).optional(),
  administeredBy: z.string().max(100).optional(),
  followUpDate: z.date().optional().nullable(),
  notes: z.string().max(500).optional(),
});

interface AddHealthRecordFormProps {
  onLogSaved?: () => void;
}

export function AddHealthRecordForm({ onLogSaved }: AddHealthRecordFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [animals, setAnimals] = useState<AnimalOption[]>([]);
  const [isLoadingAnimals, setIsLoadingAnimals] = useState(true);

  const form = useForm<z.infer<typeof addHealthRecordSchema>>({
    resolver: zodResolver(addHealthRecordSchema),
    defaultValues: {
      animalDocId: "",
      details: "",
      medicationAdministered: "",
      dosage: "",
      administeredBy: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!user || !user.farmId) {
      setAnimals([]);
      setIsLoadingAnimals(false);
      return;
    }
    const fetchAnimals = async () => {
      setIsLoadingAnimals(true);
      try {
        const q = query(
          collection(db, "livestockAnimals"),
          where("farmId", "==", user.farmId),
          orderBy("animalIdTag", "asc")
        );
        const querySnapshot = await getDocs(q);
        const fetchedAnimals = querySnapshot.docs.map(doc => ({
          id: doc.id,
          animalIdTag: doc.data().animalIdTag,
        } as AnimalOption));
        setAnimals(fetchedAnimals);
      } catch (error) {
        console.error("Failed to load animals for health record form:", error);
        toast({ title: "Error Loading Animals", description: "Could not load your registered animals.", variant: "destructive" });
      } finally {
        setIsLoadingAnimals(false);
      }
    };
    fetchAnimals();
  }, [user?.farmId, toast]);

  async function onSubmit(values: z.infer<typeof addHealthRecordSchema>) {
    if (!user || !user.uid || !user.farmId) {
      toast({ title: "Authentication Error", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    const selectedAnimal = animals.find(a => a.id === values.animalDocId);
    if (!selectedAnimal) {
        toast({ title: "Error", description: "Invalid animal selected.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    try {
      const logData = {
        ...values,
        userId: user.uid,
        farmId: user.farmId,
        animalIdTag: selectedAnimal.animalIdTag, // Denormalize for easier display in tables
        logDate: format(values.logDate, "yyyy-MM-dd"),
        followUpDate: values.followUpDate ? format(values.followUpDate, "yyyy-MM-dd") : null,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "livestockHealthLogs"), logData);
      toast({
        title: "Health Record Saved",
        description: `${values.eventType} for animal ${selectedAnimal.animalIdTag} has been logged.`,
      });
      form.reset({
        animalDocId: "",
        logDate: undefined,
        eventType: undefined,
        details: "",
        medicationAdministered: "",
        dosage: "",
        administeredBy: "",
        followUpDate: undefined,
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving health record to Firestore:", error);
      toast({
        title: "Error Saving Record",
        description: "Could not save the health record.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="animalDocId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Select Animal</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isLoadingAnimals || animals.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingAnimals ? "Loading animals..." : (animals.length === 0 ? "No animals registered" : "Select an animal")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {animals.map((animal) => (
                      <SelectItem key={animal.id} value={animal.id}>
                        {animal.animalIdTag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="logDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Event/Log</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single" selected={field.value} onSelect={field.onChange}
                      disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="eventType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {healthEventTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="details"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Details of Event/Observation</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Annual vaccination for BVD, Observed limping on front left leg, Administered penicillin for suspected infection."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="medicationAdministered"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Medication (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Penicillin, Ivermectin" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dosage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dosage (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., 10ml, 2 pills" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="administeredBy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Administered By (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Self, Dr. Smith (Vet)" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="followUpDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Follow-up Date (Optional)</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                    >
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single" selected={field.value} onSelect={field.onChange}
                    disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))} // Only future dates for follow-up
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Animal seemed lethargic, Withdrawal period for medication, Next booster due in 6 months."
                  className="resize-y min-h-[80px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting || !user || !user.farmId || isLoadingAnimals || animals.length === 0}>
          {isSubmitting ? (
            <><Icons.Search className="mr-2 h-4 w-4 animate-spin" />Saving Health Record...</>
          ) : (
            <><Icons.HealthRecord className="mr-2 h-4 w-4" /> Add Health Record</>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm.</p>}
         {(user && user.farmId && animals.length === 0 && !isLoadingAnimals) && <p className="text-sm text-destructive mt-2">Please add animals to the registry first before logging health records.</p>}
      </form>
    </Form>
  );
}
