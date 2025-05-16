
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

const addFeedLogSchema = z.object({
  animalDocId: z.string().optional(), // Optional: Log feed for a specific animal or general group
  logDate: z.date({ required_error: "Log date is required." }),
  feedType: z.string().min(1, "Feed type/name is required.").max(150, "Max 150 chars."),
  quantityConsumed: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({required_error: "Quantity is required.", invalid_type_error: "Quantity must be a number."}).positive("Quantity must be positive.")
  ),
  quantityUnit: z.string().min(1, "Unit is required (e.g., kg, lbs, bales).").max(50),
  notes: z.string().max(500, "Notes max 500 chars.").optional(),
});

interface AddFeedLogFormProps {
  onLogSaved?: () => void;
}

export function AddFeedLogForm({ onLogSaved }: AddFeedLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const [animals, setAnimals] = useState<AnimalOption[]>([]);
  const [isLoadingAnimals, setIsLoadingAnimals] = useState(true);

  const form = useForm<z.infer<typeof addFeedLogSchema>>({
    resolver: zodResolver(addFeedLogSchema),
    defaultValues: {
      feedType: "",
      quantityUnit: "kg",
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
        console.error("Failed to load animals for feed log form:", error);
        toast({ title: "Error Loading Animals", description: "Could not load your registered animals.", variant: "destructive" });
      } finally {
        setIsLoadingAnimals(false);
      }
    };
    fetchAnimals();
  }, [user?.farmId, toast]);

  async function onSubmit(values: z.infer<typeof addFeedLogSchema>) {
    if (!user || !user.uid || !user.farmId) {
      toast({ title: "Authentication Error", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    
    const selectedAnimal = values.animalDocId ? animals.find(a => a.id === values.animalDocId) : null;

    setIsSubmitting(true);
    try {
      const logData = {
        userId: user.uid,
        farmId: user.farmId,
        animalDocId: values.animalDocId || null,
        animalIdTag: selectedAnimal ? selectedAnimal.animalIdTag : null, // Denormalize for easier display
        logDate: format(values.logDate, "yyyy-MM-dd"),
        feedType: values.feedType,
        quantityConsumed: values.quantityConsumed,
        quantityUnit: values.quantityUnit,
        notes: values.notes,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "livestockFeedLogs"), logData);
      toast({
        title: "Feed Log Saved",
        description: `Feed log for ${values.feedType} has been saved.`,
      });
      form.reset({
        animalDocId: undefined,
        logDate: undefined,
        feedType: "",
        quantityConsumed: undefined,
        quantityUnit: "kg",
        notes: "",
      });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving feed log to Firestore:", error);
      toast({
        title: "Error Saving Feed Log",
        description: "Could not save the feed log.",
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
                <FormLabel>Select Animal (Optional)</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isLoadingAnimals || animals.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={isLoadingAnimals ? "Loading animals..." : (animals.length === 0 ? "No animals registered" : "Select an animal (or leave blank for group)")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">None / Group Log</SelectItem>
                    {animals.map((animal) => (
                      <SelectItem key={animal.id} value={animal.id}>
                        {animal.animalIdTag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Log feed for a specific animal or a general group/farm log.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="logDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Feeding</FormLabel>
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
            name="feedType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Feed Type / Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Hay, Grain Mix, Silage" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="quantityConsumed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity Consumed</FormLabel>
                  <FormControl><Input type="number" placeholder="e.g., 10" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantityUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl><Input placeholder="e.g., kg, lbs, bales" {...field} /></FormControl>
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
                  placeholder="e.g., Morning feeding, good appetite, new batch of feed."
                  className="resize-y min-h-[80px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !user || !user.farmId}>
          {isSubmitting ? (
            <><Icons.Search className="mr-2 h-4 w-4 animate-spin" />Saving Feed Log...</>
          ) : (
            <><Icons.FeedLog className="mr-2 h-4 w-4" /> Add Feed Log</>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm.</p>}
      </form>
    </Form>
  );
}
