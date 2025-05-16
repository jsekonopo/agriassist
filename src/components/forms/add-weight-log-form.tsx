
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
import { format } from "date-fns";
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

const weightUnits = ["kg", "lbs"] as const;

const addWeightLogSchema = z.object({
  animalDocId: z.string().min(1, "Animal selection is required."),
  logDate: z.date({ required_error: "Date of weighing is required." }),
  weight: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({required_error: "Weight is required.", invalid_type_error: "Weight must be a number."}).positive("Weight must be positive.")
  ),
  weightUnit: z.enum(weightUnits, { required_error: "Weight unit is required." }),
  notes: z.string().max(500, "Notes max 500 chars.").optional(),
});

interface AddWeightLogFormProps {
  onLogSaved?: () => void;
}

export function AddWeightLogForm({ onLogSaved }: AddWeightLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [animals, setAnimals] = useState<AnimalOption[]>([]);
  const [isLoadingAnimals, setIsLoadingAnimals] = useState(true);
  const preferredWeightUnit = user?.settings?.preferredWeightUnit || "kg";


  const form = useForm<z.infer<typeof addWeightLogSchema>>({
    resolver: zodResolver(addWeightLogSchema),
    defaultValues: {
      animalDocId: "",
      weightUnit: preferredWeightUnit,
      notes: "",
    },
  });

  useEffect(() => {
    form.reset({ weightUnit: preferredWeightUnit, animalDocId: "", notes: "" });
  }, [preferredWeightUnit, form]);

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
        console.error("Failed to load animals for weight log form:", error);
        toast({ title: "Error Loading Animals", description: "Could not load your registered animals.", variant: "destructive" });
      } finally {
        setIsLoadingAnimals(false);
      }
    };
    fetchAnimals();
  }, [user?.farmId, toast]);

  async function onSubmit(values: z.infer<typeof addWeightLogSchema>) {
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
        userId: user.uid,
        farmId: user.farmId,
        animalDocId: values.animalDocId,
        animalIdTag: selectedAnimal.animalIdTag, // Denormalize for easier display
        logDate: format(values.logDate, "yyyy-MM-dd"),
        weight: values.weight,
        weightUnit: values.weightUnit,
        notes: values.notes,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "livestockWeightLogs"), logData);
      toast({
        title: "Weight Log Saved",
        description: `Weight log for ${selectedAnimal.animalIdTag} has been saved.`,
      });
      form.reset({
        animalDocId: "",
        logDate: undefined,
        weight: undefined,
        weightUnit: preferredWeightUnit,
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving weight log to Firestore:", error);
      toast({
        title: "Error Saving Weight Log",
        description: "Could not save the weight log.",
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
                <FormLabel>Date of Weighing</FormLabel>
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
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight</FormLabel>
                  <FormControl><Input type="number" placeholder="e.g., 500" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="weightUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                      <FormControl>
                          <SelectTrigger>
                              <SelectValue placeholder="Select unit"/>
                          </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                          {weightUnits.map(unit => <SelectItem key={unit} value={unit}>{unit.toUpperCase()}</SelectItem>)}
                      </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Weaning weight, pre-breeding weight, condition score."
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
            <><Icons.Search className="mr-2 h-4 w-4 animate-spin" />Saving Weight Log...</>
          ) : (
            <><Icons.WeightLog className="mr-2 h-4 w-4" /> Add Weight Log</>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm.</p>}
        {(user && user.farmId && animals.length === 0 && !isLoadingAnimals) && <p className="text-sm text-destructive mt-2">Please add animals to the registry first.</p>}
      </form>
    </Form>
  );
}
