"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { annualExpenseSchema } from "@/lib/schemas/annual-expenses";

export async function createAnnualExpense(formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = annualExpenseSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from("annual_expenses").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/gastos");
  return { success: true };
}

export async function updateAnnualExpense(id: string, formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = annualExpenseSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("annual_expenses")
    .update({ ...parsed.data, notes: parsed.data.notes || null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/gastos");
  return { success: true };
}

export async function deleteAnnualExpense(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("annual_expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/gastos");
  return { success: true };
}
