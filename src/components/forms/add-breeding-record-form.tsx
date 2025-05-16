
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
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy } from "firebase/firestore";

interface AnimalOption {
  id: string; // Firestore document ID of the animal
  animalIdTag: string;
}

const breedingMethods = ["Natural Service", "Artificial Insemination", "Embryo Transfer", "Unknown", "Other"] as const;

const addBreedingRecordSchema = z.object({
  damAnimalDocId: z.string().min(1, "Dam (Mother) selection is required."),
  sireAnimalDocId: z.string().optional(),
  breedingDate: z.date().optional().nullable(),
  expectedDueDate: z.date().optional().nullable(),
  actualBirthDate: z.date().optional().nullable(),
  numberOfOffspring: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({ invalid_type_error: "Number of offspring must be a number." }).int().min(0, "Number of offspring cannot be negative.").optional()
  ),
  offspringMaleCount: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({ invalid_type_error: "Male count must be a number." }).int().min(0).optional()
  ),
  offspringFemaleCount: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({ invalid_type_error: "Female count must be a number." }).int().min(0).optional()
  ),
  offspringIdTags: z.string().optional().describe("Comma-separated list of offspring ID tags."),
  breedingMethod: z.enum(breedingMethods).optional(),
  notes: z.string().max(500, "Notes max 500 chars.").optional(),
});

interface AddBreedingRecordFormProps {
  onLogSaved?: () => void;
}

export function AddBreedingRecordForm({ onLogSaved }: AddBreedingRecordFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [animals, setAnimals] = useState<AnimalOption[]>([]);
  const [isLoadingAnimals, setIsLoadingAnimals] = useState(true);

  const form = useForm<z.infer<typeof addBreedingRecordSchema>>({
    resolver: zodResolver(addBreedingRecordSchema),
    defaultValues: {
      damAnimalDocId: "",
      sireAnimalDocId: "",
      offspringIdTags: "",
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
        console.error("Failed to load animals for breeding record form:", error);
        toast({ title: "Error Loading Animals", description: "Could not load your registered animals.", variant: "destructive" });
      } finally {
        setIsLoadingAnimals(false);
      }
    };
    fetchAnimals();
  }, [user?.farmId, toast]);

  async function onSubmit(values: z.infer<typeof addBreedingRecordSchema>) {
    if (!user || !user.uid || !user.farmId) {
      toast({ title: "Authentication Error", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    const dam = animals.find(a => a.id === values.damAnimalDocId);
    const sire = animals.find(a => a.id === values.sireAnimalDocId);

    if (!dam) {
      toast({ title: "Error", description: "Invalid Dam selected.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const logData = {
        userId: user.uid,
        farmId: user.farmId,
        damAnimalDocId: values.damAnimalDocId,
        damAnimalIdTag: dam.animalIdTag,
        sireAnimalDocId: values.sireAnimalDocId || null,
        sireAnimalIdTag: sire ? sire.animalIdTag : null,
        breedingDate: values.breedingDate ? format(values.breedingDate, "yyyy-MM-dd") : null,
        expectedDueDate: values.expectedDueDate ? format(values.expectedDueDate, "yyyy-MM-dd") : null,
        actualBirthDate: values.actualBirthDate ? format(values.actualBirthDate, "yyyy-MM-dd") : null,
        numberOfOffspring: values.numberOfOffspring,
        offspringGenderCounts: {
            male: values.offspringMaleCount,
            female: values.offspringFemaleCount,
        },
        offspringIdTags: values.offspringIdTags ? values.offspringIdTags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        breedingMethod: values.breedingMethod,
        notes: values.notes,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "livestockBreedingRecords"), logData);
      toast({
        title: "Breeding Record Saved",
        description: `Breeding event for Dam ${dam.animalIdTag} has been logged.`,
      });
      form.reset();
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving breeding record to Firestore:", error);
      toast({
        title: "Error Saving Record",
        description: "Could not save the breeding record.",
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
            name="damAnimalDocId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dam (Mother)</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isLoadingAnimals || animals.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingAnimals ? "Loading animals..." : (animals.length === 0 ? "No animals registered" : "Select Dam")} />
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
            name="sireAnimalDocId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sire (Father) (Optional)</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isLoadingAnimals || animals.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingAnimals ? "Loading animals..." : (animals.length === 0 ? "No animals registered" : "Select Sire")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                     <SelectItem value="">None / Unknown</SelectItem>
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <FormField
            control={form.control}
            name="breedingDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Breeding Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expectedDueDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Expected Due Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="actualBirthDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Actual Birth Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField
                control={form.control}
                name="numberOfOffspring"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Total Offspring (Optional)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 2" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="offspringMaleCount"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Males Born (Optional)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 1" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="offspringFemaleCount"
                render={({ field }) => (
                <FormItem>
                    <FormLabel>Females Born (Optional)</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g., 1" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>

        <FormField
            control={form.control}
            name="offspringIdTags"
            render={({ field }) => (
            <FormItem>
                <FormLabel>Offspring ID Tags (Optional)</FormLabel>
                <FormControl><Input placeholder="e.g., TAG001, TAG002, TAG003" {...field} /></FormControl>
                <FormDescription>Comma-separated list. Register these animals separately in the Animal Registry.</FormDescription>
                <FormMessage />
            </FormItem>
            )}
        />

        <FormField
            control={form.control}
            name="breedingMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Breeding Method (Optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select breeding method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {breedingMethods.map(method => (
                      <SelectItem key={method} value={method}>{method}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g., Difficult birth, notes on sire quality, etc." className="resize-y min-h-[80px]" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting || !user || !user.farmId || isLoadingAnimals || animals.length === 0}>
          {isSubmitting ? (
            <><Icons.Search className="mr-2 h-4 w-4 animate-spin" />Saving Breeding Record...</>
          ) : (
            <><Icons.Breeding className="mr-2 h-4 w-4" /> Add Breeding Record</>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm.</p>}
         {(user && user.farmId && animals.length === 0 && !isLoadingAnimals) && <p className="text-sm text-destructive mt-2">Please add animals to the registry first.</p>}
      </form>
    </Form>
  );
}
