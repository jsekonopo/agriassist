
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
import { useState } from "react";
import { Icons } from "../icons";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const taskLogSchema = z.object({
  taskName: z.string().min(1, "Task name is required."),
  description: z.string().optional(),
  dueDate: z.date().optional(),
  assignedTo: z.string().optional(),
  status: z.enum(["To Do", "In Progress", "Done"], {
    required_error: "Status is required.",
  }),
});

interface TaskLogFormProps {
  onLogSaved?: () => void;
}

export function TaskLogForm({ onLogSaved }: TaskLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  const form = useForm<z.infer<typeof taskLogSchema>>({
    resolver: zodResolver(taskLogSchema),
    defaultValues: {
      taskName: "",
      description: "",
      assignedTo: "",
      status: "To Do",
    },
  });

  async function onSubmit(values: z.infer<typeof taskLogSchema>) {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to save a task.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const taskData = {
        ...values,
        userId: user.uid,
        dueDate: values.dueDate ? format(values.dueDate, "yyyy-MM-dd") : null, // Store as string or null
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "taskLogs"), taskData);
      toast({
        title: "Task Saved",
        description: `Task: ${values.taskName} has been saved to Firestore.`,
      });
      form.reset({ taskName: "", description: "", assignedTo: "", status: "To Do", dueDate: undefined });
      if (onLogSaved) {
        onLogSaved();
      }
    } catch (error) {
      console.error("Error saving task to Firestore:", error);
      toast({
        title: "Error Saving Task",
        description: "Could not save the task to Firestore.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="taskName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Fertilize Field A, Repair Fence" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Details about the task..."
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
            name="dueDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Due Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() -1))} // Disable past dates
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
            name="assignedTo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assigned To (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., John Doe, Team B" {...field} />
                </FormControl>
                <FormDescription>Enter a name or team.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select task status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="To Do">To Do</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Done">Done</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={isSubmitting || !user}>
          {isSubmitting ? (
            <>
              <Icons.User className="mr-2 h-4 w-4 animate-spin" /> 
              Saving Task...
            </>
          ) : (
            <>
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              Save Task
            </>
          )}
        </Button>
        {!user && <p className="text-sm text-destructive">Please log in to save tasks.</p>}
      </form>
    </Form>
  );
}
