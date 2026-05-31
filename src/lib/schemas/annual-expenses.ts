import { z } from "zod";

export const annualExpenseSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  amount: z
    .number({ error: "Ingresá un monto válido" })
    .positive("El monto debe ser mayor a 0"),
  due_date: z.string().min(1, "La fecha es requerida"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type AnnualExpenseFormValues = z.infer<typeof annualExpenseSchema>;
