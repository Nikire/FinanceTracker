"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { updateMonthlyRecord } from "@/lib/actions/services";
import { Tables } from "@/lib/supabase/database.types";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  amount: z.number({ error: "Ingresá un monto válido" }).positive().optional(),
  currency: z.enum(["ARS", "USD"]).optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

interface MonthlyRecordFormProps {
  service: Tables<"services">;
  record: Tables<"service_monthly_records"> | null;
  year: number;
  month: number;
  onSuccess: () => void;
}

export function MonthlyRecordForm({ service, record, year, month, onSuccess }: MonthlyRecordFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      amount: record?.amount ?? service.amount,
      currency: (record?.currency ?? service.currency) as "ARS" | "USD",
      notes: record?.notes ?? service.notes ?? "",
    },
  });

  async function onSubmit(values: FormValues) {
    const result = await updateMonthlyRecord(service.id, year, month, values);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Registro actualizado");
    onSuccess();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Editando valores para <span className="font-medium text-foreground">{service.name}</span> en este mes. Los cambios no afectan otros meses.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto este mes</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.valueAsNumber || undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Moneda</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="ARS">ARS</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
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
              <FormLabel>Notas (opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Observaciones de este mes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
