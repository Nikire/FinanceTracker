"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { annualExpenseSchema, type AnnualExpenseFormValues } from "@/lib/schemas/annual-expenses";
import { createAnnualExpense, updateAnnualExpense } from "@/lib/actions/annual-expenses";
import { Tables } from "@/lib/supabase/database.types";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface GastoFormProps {
  gasto?: Tables<"annual_expenses">;
  onSuccess: () => void;
}

export function GastoForm({ gasto, onSuccess }: GastoFormProps) {
  const form = useForm<AnnualExpenseFormValues>({
    resolver: zodResolver(annualExpenseSchema) as Resolver<AnnualExpenseFormValues>,
    defaultValues: gasto
      ? {
          name: gasto.name,
          amount: gasto.amount,
          currency: gasto.currency,
          due_date: gasto.due_date,
          recurring: gasto.recurring,
          notes: gasto.notes ?? "",
        }
      : { name: "", amount: 0, currency: "ARS", due_date: "", recurring: false, notes: "" },
  });

  async function onSubmit(values: AnnualExpenseFormValues) {
    const result = gasto
      ? await updateAnnualExpense(gasto.id, values)
      : await createAnnualExpense(values);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(gasto ? "Gasto actualizado" : "Gasto creado");
    onSuccess();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input placeholder="AFIP, seguro, impuesto..." {...field} />
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
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Moneda</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
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
        </div>

        <FormField
          control={form.control}
          name="due_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de vencimiento</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="recurring"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel className="cursor-pointer">Se repite cada año</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Al vencer, se genera automáticamente la entrada del año siguiente
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
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
            {form.formState.isSubmitting ? "Guardando..." : gasto ? "Actualizar" : "Crear"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
