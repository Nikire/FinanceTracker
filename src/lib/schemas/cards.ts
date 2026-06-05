import { z } from "zod";

export const cardPurchaseSchema = z.object({
  description: z.string().min(1, "La descripción es requerida").max(200),
  total_amount: z.number({ error: "Ingresá un monto válido" }).positive("El monto debe ser mayor a 0"),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  purchase_date: z.string().min(1, "La fecha es requerida"),
  installments: z.number().int().min(1).max(120).default(1),
  card: z.string().max(100).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export type CardPurchaseFormValues = z.infer<typeof cardPurchaseSchema>;
