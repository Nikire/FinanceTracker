"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema } from "@/lib/schemas/services";

export async function createService(formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = serviceSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from("services").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function updateService(id: string, formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = serviceSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("services")
    .update({ ...parsed.data, notes: parsed.data.notes || null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function toggleService(id: string, active: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("services")
    .update({ active })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}
