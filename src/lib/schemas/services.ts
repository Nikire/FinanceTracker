import { z } from "zod";

export const serviceSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  amount: z
    .number({ error: "Ingresá un monto válido" })
    .positive("El monto debe ser mayor a 0"),
  debit_day: z
    .number()
    .int()
    .min(1, "El día debe ser entre 1 y 31")
    .max(31, "El día debe ser entre 1 y 31"),
  active: z.boolean(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;
