"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cardPurchaseSchema } from "@/lib/schemas/cards";

function revalidate() {
  revalidatePath("/tarjeta");
  revalidatePath("/grupos");
}

export async function createCardPurchase(
  formData: unknown,
  opts?: { paidCount?: number; firstYear?: number; firstMonth?: number }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = cardPurchaseSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const { data: purchase, error } = await supabase
    .from("card_purchases")
    .insert({
      user_id: user.id,
      description: d.description,
      total_amount: d.total_amount,
      currency: d.currency,
      purchase_date: d.purchase_date,
      installments: d.installments,
      card: d.card || null,
      notes: d.notes || null,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  const n = d.installments;
  const startY = opts?.firstYear ?? Number(d.purchase_date.slice(0, 4));
  const startM = opts?.firstMonth ?? Number(d.purchase_date.slice(5, 7));
  const paidCount = Math.min(Math.max(opts?.paidCount ?? 0, 0), n);
  const base = Math.round((d.total_amount / n) * 100) / 100;
  const now = new Date().toISOString();

  const rows = Array.from({ length: n }, (_, i) => {
    const number = i + 1;
    const amount = number < n ? base : Math.round((d.total_amount - base * (n - 1)) * 100) / 100;
    const idx = startY * 12 + (startM - 1) + i;
    const paid = number <= paidCount;
    return {
      user_id: user.id,
      purchase_id: purchase.id,
      number,
      amount,
      year: Math.floor(idx / 12),
      month: (idx % 12) + 1,
      is_paid: paid,
      paid_at: paid ? now : null,
    };
  });

  const { error: insErr } = await supabase.from("card_installments").insert(rows);
  if (insErr) return { error: insErr.message };
  revalidate();
  return { success: true };
}

export async function deleteCardPurchase(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  const { error } = await supabase.from("card_purchases").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidate();
  return { success: true };
}

export async function setInstallmentPaid(installmentId: string, isPaid: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  const { error } = await supabase
    .from("card_installments")
    .update({ is_paid: isPaid, paid_at: isPaid ? new Date().toISOString() : null })
    .eq("id", installmentId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidate();
  return { success: true };
}
