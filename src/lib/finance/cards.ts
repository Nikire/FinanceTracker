import type { AdminClient } from "@/lib/supabase/admin";
import type { OpResult } from "./operations";
import { cardPurchaseSchema } from "@/lib/schemas/cards";

/**
 * Uso de tarjeta: consumos puntuales y compras en cuotas. Al crear una compra
 * en N cuotas se generan las N cuotas (una por mes consecutivo) y se puede
 * marcar cuántas ya están pagas. Permite ver qué cuotas quedan pendientes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const periodLabel = (y: number, m: number) => `${MESES[m - 1]} ${y}`;

type Ctx = { sb: AdminClient; userId: string };

async function resolvePurchase(
  { sb, userId }: Ctx,
  ref: string
): Promise<{ purchase: { id: string; description: string } } | { error: string }> {
  const { data, error } = await sb
    .from("card_purchases")
    .select("id, description")
    .eq("user_id", userId);
  if (error) return { error: error.message };
  const all = data ?? [];
  if (UUID_RE.test(ref.trim())) {
    const found = all.find((p) => p.id === ref.trim());
    return found ? { purchase: found } : { error: `No existe un consumo con id ${ref}` };
  }
  const q = ref.trim().toLowerCase();
  let matches = all.filter((p) => p.description.toLowerCase() === q);
  if (!matches.length) matches = all.filter((p) => p.description.toLowerCase().includes(q));
  if (!matches.length) return { error: `No encontré un consumo que coincida con "${ref}".` };
  if (matches.length > 1) {
    return { error: `Varios consumos coinciden con "${ref}": ${matches.map((p) => p.description).join(", ")}. Especificá cuál o usá el id.` };
  }
  return { purchase: matches[0] };
}

export async function createCardPurchase(
  ctx: Ctx,
  args: {
    description: string;
    total_amount: number;
    purchase_date: string;
    currency?: "ARS" | "USD";
    installments?: number;
    card?: string;
    notes?: string;
    first_year?: number;
    first_month?: number;
    paid_count?: number;
  }
): Promise<OpResult> {
  const parsed = cardPurchaseSchema.safeParse({
    description: args.description,
    total_amount: args.total_amount,
    currency: args.currency ?? "ARS",
    purchase_date: args.purchase_date,
    installments: args.installments ?? 1,
    card: args.card ?? "",
    notes: args.notes ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: purchase, error } = await ctx.sb
    .from("card_purchases")
    .insert({
      user_id: ctx.userId,
      description: parsed.data.description,
      total_amount: parsed.data.total_amount,
      currency: parsed.data.currency,
      purchase_date: parsed.data.purchase_date,
      installments: parsed.data.installments,
      card: parsed.data.card || null,
      notes: parsed.data.notes || null,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const n = parsed.data.installments;
  const startY = args.first_year ?? Number(parsed.data.purchase_date.slice(0, 4));
  const startM = args.first_month ?? Number(parsed.data.purchase_date.slice(5, 7));
  const paidCount = Math.min(Math.max(args.paid_count ?? 0, 0), n);
  const base = Math.round((parsed.data.total_amount / n) * 100) / 100;
  const now = new Date().toISOString();

  const rows = Array.from({ length: n }, (_, i) => {
    const number = i + 1;
    const amount = number < n ? base : Math.round((parsed.data.total_amount - base * (n - 1)) * 100) / 100;
    const idx = startY * 12 + (startM - 1) + i;
    const paid = number <= paidCount;
    return {
      user_id: ctx.userId,
      purchase_id: purchase.id,
      number,
      amount,
      year: Math.floor(idx / 12),
      month: (idx % 12) + 1,
      is_paid: paid,
      paid_at: paid ? now : null,
    };
  });

  const { error: insErr } = await ctx.sb.from("card_installments").insert(rows);
  if (insErr) return { error: insErr.message };

  return {
    success: true,
    purchase,
    installments: rows.map((r) => ({ number: r.number, amount: r.amount, period: periodLabel(r.year, r.month), is_paid: r.is_paid })),
  };
}

export async function listCardPurchases(ctx: Ctx): Promise<OpResult> {
  const { data, error } = await ctx.sb
    .from("card_purchases")
    .select("*, card_installments(number, amount, year, month, is_paid)")
    .eq("user_id", ctx.userId)
    .order("purchase_date", { ascending: false });
  if (error) return { error: error.message };

  const purchases = (data ?? []).map((p) => {
    const insts = (p.card_installments ?? []).sort((a, b) => a.number - b.number);
    const pending = insts.filter((i) => !i.is_paid);
    return {
      id: p.id,
      description: p.description,
      purchase_date: p.purchase_date,
      currency: p.currency,
      total_amount: p.total_amount,
      installments: p.installments,
      card: p.card,
      pending_count: pending.length,
      cuotas: insts.map((i) => ({
        number: i.number,
        amount: i.amount,
        period: periodLabel(i.year, i.month),
        is_paid: i.is_paid,
      })),
    };
  });
  return { count: purchases.length, purchases };
}

export async function listPendingInstallments(
  ctx: Ctx,
  args: { untilYear?: number; untilMonth?: number }
): Promise<OpResult> {
  const { data, error } = await ctx.sb
    .from("card_installments")
    .select("number, amount, year, month, is_paid, card_purchases(description, currency)")
    .eq("user_id", ctx.userId)
    .eq("is_paid", false)
    .order("year")
    .order("month");
  if (error) return { error: error.message };

  let list = data ?? [];
  if (args.untilYear != null && args.untilMonth != null) {
    const limit = args.untilYear * 12 + args.untilMonth;
    list = list.filter((i) => i.year * 12 + i.month <= limit);
  }

  const pending = list.map((i) => {
    const purchase = i.card_purchases as unknown as { description: string; currency: string } | null;
    return {
      description: purchase?.description ?? "(consumo)",
      cuota: i.number,
      amount: i.amount,
      currency: purchase?.currency ?? "ARS",
      period: periodLabel(i.year, i.month),
    };
  });
  const totalArs = pending.filter((p) => p.currency !== "USD").reduce((s, p) => s + p.amount, 0);
  const totalUsd = pending.filter((p) => p.currency === "USD").reduce((s, p) => s + p.amount, 0);
  return { pending_count: pending.length, total_pending_ars: totalArs, total_pending_usd: totalUsd, pending };
}

export async function markInstallment(
  ctx: Ctx,
  args: { purchase: string; number: number; isPaid: boolean }
): Promise<OpResult> {
  const r = await resolvePurchase(ctx, args.purchase);
  if ("error" in r) return r;
  const { error } = await ctx.sb
    .from("card_installments")
    .update({ is_paid: args.isPaid, paid_at: args.isPaid ? new Date().toISOString() : null })
    .eq("user_id", ctx.userId)
    .eq("purchase_id", r.purchase.id)
    .eq("number", args.number);
  if (error) return { error: error.message };
  return { success: true, purchase: r.purchase.description, cuota: args.number, is_paid: args.isPaid };
}

export async function deleteCardPurchase(ctx: Ctx, args: { purchase: string }): Promise<OpResult> {
  const r = await resolvePurchase(ctx, args.purchase);
  if ("error" in r) return r;
  // las cuotas se borran en cascada por la FK
  const { error } = await ctx.sb
    .from("card_purchases")
    .delete()
    .eq("id", r.purchase.id)
    .eq("user_id", ctx.userId);
  if (error) return { error: error.message };
  return { success: true, deleted: { id: r.purchase.id, description: r.purchase.description } };
}
