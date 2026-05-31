import { z } from "zod";

export const incomeSchema = z.object({
  description: z.string().min(1, "La descripción es requerida").max(100),
  amount: z
    .number({ error: "Ingresá un monto válido" })
    .positive("El monto debe ser mayor a 0"),
  frequency: z.enum(["monthly", "annual", "fixed"]),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type IncomeFormValues = z.infer<typeof incomeSchema>;
