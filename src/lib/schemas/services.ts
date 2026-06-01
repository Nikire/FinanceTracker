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
  currency: z.enum(["ARS", "USD"]),
  recurrence: z.enum(["monthly", "one_time"]),
  auto_debit: z.boolean(),
  active: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const monthlyRecordSchema = z.object({
  amount: z
    .number({ error: "Ingresá un monto válido" })
    .positive("El monto debe ser mayor a 0")
    .optional(),
  currency: z.enum(["ARS", "USD"]).optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;

export const exchangeRateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  usd_to_ars: z
    .number({ error: "Ingresá un valor válido" })
    .positive("El tipo de cambio debe ser mayor a 0"),
});

export type ExchangeRateFormValues = z.infer<typeof exchangeRateSchema>;
