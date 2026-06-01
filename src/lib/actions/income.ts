"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { incomeSchema } from "@/lib/schemas/income";

export async function createIncome(formData: unknown, year: number, month: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Período inválido" };
  }

  const parsed = incomeSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from("income").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
    color: parsed.data.color || null,
    currency: parsed.data.currency,
    year,
    month,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/ingresos");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateIncome(id: string, formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = incomeSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("income")
    .update({ ...parsed.data, notes: parsed.data.notes || null, color: parsed.data.color || null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/ingresos");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteIncome(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("income")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/ingresos");
  revalidatePath("/dashboard");
  return { success: true };
}
