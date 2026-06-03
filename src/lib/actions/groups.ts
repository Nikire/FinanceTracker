"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { groupSchema } from "@/lib/schemas/groups";
import type { Enums } from "@/lib/supabase/database.types";

type EntityType = Enums<"group_entity">;

function revalidateAll() {
  revalidatePath("/grupos");
  revalidatePath("/servicios");
  revalidatePath("/ingresos");
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
}

export async function createGroup(formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = groupSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("groups")
    .insert({ name: parsed.data.name, color: parsed.data.color ?? null, user_id: user.id });
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function updateGroup(id: string, formData: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = groupSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("groups")
    .update({ name: parsed.data.name, color: parsed.data.color ?? null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function deleteGroup(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase.from("groups").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function addToGroup(groupId: string, entityType: EntityType, entityId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase.from("group_items").upsert(
    { user_id: user.id, group_id: groupId, entity_type: entityType, entity_id: entityId },
    { onConflict: "group_id,entity_type,entity_id", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}

export async function removeFromGroup(groupId: string, entityType: EntityType, entityId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("group_items")
    .delete()
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) return { error: error.message };
  revalidateAll();
  return { success: true };
}
