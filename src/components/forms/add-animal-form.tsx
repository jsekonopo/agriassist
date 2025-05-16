
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Icons } from "../icons";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const animalSpecies = ["Cattle", "Sheep", "Goat", "Pig", "Poultry", "Horse", "Other"] as const;
const animalGenders = ["Male", "Female", "Castrated Male", "Unknown"] as const;

const addAnimalFormSchema = z.object({
  animalIdTag: z.string().min(1, "Animal ID/Tag is required."),
  species: z.enum(animalSpecies, { required_error: "Species is required." }),
  breed: z.string().optional(),
  birthDate: z.date().optional(),
  gender: z.enum(animalGenders).optional(),
  damIdTag: z.string().optional(),
  sireIdTag: z.string().optional(),
  notes: z.string().max(500, "Notes can be up to 500 characters.").optional(),
});

interface AddAnimalFormProps {
  onLogSaved?: () => void;
}

export function AddAnimalForm({ onLogSaved }: AddAnimalFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  const form = useForm<z.infer<typeof addAnimalFormSchema>>({
    resolver: zodResolver(addAnimalFormSchema),
    defaultValues: {
      animalIdTag: "",
      breed: "",
      gender: "Unknown",
      damIdTag: "",
      sireIdTag: "",
      notes: "",
    },
  });

  async function onSubmit(values: z.infer<typeof addAnimalFormSchema>) {
    if (!user || !user.uid || !user.farmId) {
      toast({ title: "Authentication Error", description: "You must be logged in and associated with a farm.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const animalData = {
        ...values,
        userId: user.uid,
        farmId: user.farmId,
        birthDate: values.birthDate ? format(values.birthDate, "yyyy-MM-dd") : null,
        gender: values.gender || "Unknown",
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "livestockAnimals"), animalData);
      toast({
        title: "Animal Added",
        description: `Animal ${values.animalIdTag} (${values.species}) has been added to your registry.`,
      });
      form.reset();
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error adding animal to Firestore:", error);
      toast({
        title: "Error Adding Animal",
        description: "Could not add the animal to the registry.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="animalIdTag"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Animal ID / Tag</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., EARTAG-001, Cow-Bella" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="species"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Species</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select species" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {animalSpecies.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="breed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Breed (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Angus, Holstein, Merino" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="birthDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Birth Date (Optional)</FormLabel>
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
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
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
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gender (Optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value || "Unknown"}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {animalGenders.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="damIdTag"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dam (Mother) ID/Tag (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., EARTAG-MOTHER" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sireIdTag"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sire (Father) ID/Tag (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., EARTAG-FATHER" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Purchased from Green Valley Farm, distinguishing marks..."
                  className="resize-y min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !user || !user.farmId}>
          {isSubmitting ? (
            <>
              <Icons.Search className="mr-2 h-4 w-4 animate-spin" />
              Adding Animal...
            </>
          ) : (
            <>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              Add Animal to Registry
            </>
          )}
        </Button>
        {(!user || !user.farmId) && <p className="text-sm text-destructive mt-2">You must be associated with a farm to add animals.</p>}
      </form>
    </Form>
  );
}
