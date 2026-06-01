"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { incomeSchema } from "@/lib/schemas/income";

export async function createIncome(formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = incomeSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from("income").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
    currency: parsed.data.currency,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/ingresos");
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
    .update({ ...parsed.data, notes: parsed.data.notes || null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/ingresos");
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
  return { success: true };
}
