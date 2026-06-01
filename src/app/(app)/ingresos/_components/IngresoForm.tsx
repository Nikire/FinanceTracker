"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { incomeSchema, type IncomeFormValues } from "@/lib/schemas/income";
import { createIncome, updateIncome } from "@/lib/actions/income";
import { Tables } from "@/lib/supabase/database.types";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface IngresoFormProps {
  ingreso?: Tables<"income">;
  onSuccess: () => void;
}

const FREQUENCY_LABELS = {
  monthly: "Mensual",
  annual: "Anual",
  fixed: "Fijo (único)",
};

export function IngresoForm({ ingreso, onSuccess }: IngresoFormProps) {
  const form = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema) as Resolver<IncomeFormValues>,
    defaultValues: ingreso
      ? {
          description: ingreso.description,
          amount: ingreso.amount,
          frequency: ingreso.frequency,
          currency: (ingreso.currency ?? "ARS") as "ARS" | "USD",
          notes: ingreso.notes ?? "",
        }
      : { description: "", amount: 0, frequency: "monthly", currency: "ARS", notes: "" },
  });

  async function onSubmit(values: IncomeFormValues) {
    const result = ingreso
      ? await updateIncome(ingreso.id, values)
      : await createIncome(values);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(ingreso ? "Ingreso actualizado" : "Ingreso creado");
    onSuccess();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Input placeholder="Sueldo, freelance, alquiler..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frecuencia</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
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
                  <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
                  <SelectItem value="USD">USD — Dólar</SelectItem>
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
              <FormLabel>Notas (opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Observaciones..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Guardando..." : ingreso ? "Actualizar" : "Crear"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
