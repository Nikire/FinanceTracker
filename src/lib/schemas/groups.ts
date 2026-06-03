import { z } from "zod";

export const groupSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export type GroupFormValues = z.infer<typeof groupSchema>;
