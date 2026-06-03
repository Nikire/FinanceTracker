import type { AdminClient } from "@/lib/supabase/admin";
import type { OpResult } from "./operations";
import { groupSchema } from "@/lib/schemas/groups";

/**
 * Grupos/carpetas cross-tipo con relación muchos-a-muchos. Un grupo agrupa
 * servicios, gastos anuales e ingresos; cada ítem puede estar en varios grupos.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_TYPES = ["service", "annual_expense", "income"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

type Ctx = { sb: AdminClient; userId: string };

const ENTITY_LABEL: Record<EntityType, string> = {
  service: "servicio",
  annual_expense: "gasto anual",
  income: "ingreso",
};

// ── Resolución ────────────────────────────────────────────────────────────────

async function resolveGroup(
  { sb, userId }: Ctx,
  ref: string
): Promise<{ group: { id: string; name: string; color: string | null } } | { error: string }> {
  const { data, error } = await sb.from("groups").select("id, name, color").eq("user_id", userId);
  if (error) return { error: error.message };
  const all = data ?? [];

  if (UUID_RE.test(ref.trim())) {
    const found = all.find((g) => g.id === ref.trim());
    return found ? { group: found } : { error: `No existe un grupo con id ${ref}` };
  }
  const q = ref.trim().toLowerCase();
  let matches = all.filter((g) => g.name.toLowerCase() === q);
  if (!matches.length) matches = all.filter((g) => g.name.toLowerCase().includes(q));
  if (!matches.length) {
    const names = all.map((g) => g.name).join(", ") || "(no hay grupos)";
    return { error: `No encontré un grupo que coincida con "${ref}". Grupos: ${names}` };
  }
  if (matches.length > 1) {
    return { error: `Varios grupos coinciden con "${ref}": ${matches.map((g) => g.name).join(", ")}. Especificá cuál.` };
  }
  return { group: matches[0] };
}

async function loadEntities(ctx: Ctx, type: EntityType): Promise<{ id: string; label: string }[]> {
  if (type === "service") {
    const { data } = await ctx.sb.from("services").select("id, name").eq("user_id", ctx.userId);
    return (data ?? []).map((r) => ({ id: r.id, label: r.name }));
  }
  if (type === "annual_expense") {
    const { data } = await ctx.sb.from("annual_expenses").select("id, name").eq("user_id", ctx.userId);
    return (data ?? []).map((r) => ({ id: r.id, label: r.name }));
  }
  const { data } = await ctx.sb.from("income").select("id, description").eq("user_id", ctx.userId);
  return (data ?? []).map((r) => ({ id: r.id, label: r.description }));
}

async function resolveEntity(
  ctx: Ctx,
  type: EntityType,
  ref: string
): Promise<{ id: string; label: string } | { error: string }> {
  const all = await loadEntities(ctx, type);
  if (UUID_RE.test(ref.trim())) {
    const found = all.find((e) => e.id === ref.trim());
    return found ? found : { error: `No existe un ${ENTITY_LABEL[type]} con id ${ref}` };
  }
  const q = ref.trim().toLowerCase();
  let matches = all.filter((e) => e.label.toLowerCase() === q);
  if (!matches.length) matches = all.filter((e) => e.label.toLowerCase().includes(q));
  if (!matches.length) {
    return { error: `No encontré un ${ENTITY_LABEL[type]} que coincida con "${ref}".` };
  }
  if (matches.length > 1) {
    return { error: `Varios ${ENTITY_LABEL[type]} coinciden con "${ref}": ${matches.map((e) => e.label).join(", ")}. Especificá cuál.` };
  }
  return matches[0];
}

// ── Operaciones ───────────────────────────────────────────────────────────────

export async function createGroup(
  ctx: Ctx,
  args: { name: string; color?: string | null }
): Promise<OpResult> {
  const parsed = groupSchema.safeParse({ name: args.name, color: args.color ?? null });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("groups")
    .insert({ name: parsed.data.name, color: parsed.data.color ?? null, user_id: ctx.userId })
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, created: data };
}

export async function listGroups(ctx: Ctx): Promise<OpResult> {
  const { data: groups, error } = await ctx.sb
    .from("groups")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("name");
  if (error) return { error: error.message };

  const { data: items } = await ctx.sb
    .from("group_items")
    .select("group_id, entity_type, entity_id")
    .eq("user_id", ctx.userId);

  // Mapa de etiquetas por tipo:id para resolver nombres de los miembros.
  const labels = new Map<string, string>();
  for (const type of ENTITY_TYPES) {
    for (const e of await loadEntities(ctx, type)) labels.set(`${type}:${e.id}`, e.label);
  }

  const result = (groups ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    members: (items ?? [])
      .filter((it) => it.group_id === g.id)
      .map((it) => ({
        entity_type: it.entity_type,
        entity_id: it.entity_id,
        label: labels.get(`${it.entity_type}:${it.entity_id}`) ?? "(eliminado)",
      })),
  }));
  return { count: result.length, groups: result };
}

export async function updateGroup(
  ctx: Ctx,
  args: { group: string; name?: string; color?: string | null }
): Promise<OpResult> {
  const r = await resolveGroup(ctx, args.group);
  if ("error" in r) return r;

  const merged = {
    name: args.name ?? r.group.name,
    color: args.color !== undefined ? args.color : r.group.color,
  };
  const parsed = groupSchema.safeParse(merged);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("groups")
    .update({ name: parsed.data.name, color: parsed.data.color ?? null })
    .eq("id", r.group.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, updated: data };
}

export async function deleteGroup(ctx: Ctx, args: { group: string }): Promise<OpResult> {
  const r = await resolveGroup(ctx, args.group);
  if ("error" in r) return r;
  // group_items se borran en cascada por la FK.
  const { error } = await ctx.sb
    .from("groups")
    .delete()
    .eq("id", r.group.id)
    .eq("user_id", ctx.userId);
  if (error) return { error: error.message };
  return { success: true, deleted: { id: r.group.id, name: r.group.name } };
}

export async function addToGroup(
  ctx: Ctx,
  args: { group: string; entity_type: EntityType; entity: string }
): Promise<OpResult> {
  if (!ENTITY_TYPES.includes(args.entity_type)) {
    return { error: `entity_type inválido. Usá uno de: ${ENTITY_TYPES.join(", ")}` };
  }
  const g = await resolveGroup(ctx, args.group);
  if ("error" in g) return g;
  const e = await resolveEntity(ctx, args.entity_type, args.entity);
  if ("error" in e) return e;

  const { error } = await ctx.sb.from("group_items").upsert(
    { user_id: ctx.userId, group_id: g.group.id, entity_type: args.entity_type, entity_id: e.id },
    { onConflict: "group_id,entity_type,entity_id", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };
  return {
    success: true,
    group: g.group.name,
    added: { entity_type: args.entity_type, label: e.label },
  };
}

export async function removeFromGroup(
  ctx: Ctx,
  args: { group: string; entity_type: EntityType; entity: string }
): Promise<OpResult> {
  const g = await resolveGroup(ctx, args.group);
  if ("error" in g) return g;
  const e = await resolveEntity(ctx, args.entity_type, args.entity);
  if ("error" in e) return e;

  const { error } = await ctx.sb
    .from("group_items")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("group_id", g.group.id)
    .eq("entity_type", args.entity_type)
    .eq("entity_id", e.id);
  if (error) return { error: error.message };
  return { success: true, group: g.group.name, removed: { entity_type: args.entity_type, label: e.label } };
}
