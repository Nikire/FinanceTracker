"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema, exchangeRateSchema } from "@/lib/schemas/services";

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

export async function togglePayment(
  serviceId: string,
  year: number,
  month: number,
  isPaid: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("service_payments")
    .upsert(
      {
        service_id: serviceId,
        user_id: user.id,
        year,
        month,
        is_paid: isPaid,
        paid_at: isPaid ? new Date().toISOString() : null,
      },
      { onConflict: "service_id,year,month" }
    );

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function setMonthlyActive(
  serviceId: string,
  year: number,
  month: number,
  isActive: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await supabase
    .from("service_payments")
    .upsert(
      { service_id: serviceId, user_id: user.id, year, month, is_active: isActive },
      { onConflict: "service_id,year,month" }
    );

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function autoMarkPaidForMonth(year: number, month: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const today = new Date();

  const { data: services } = await supabase
    .from("services")
    .select("id, debit_day")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("auto_debit", true);

  if (!services?.length) return { success: true };

  const rows = services
    .filter((s) => {
      // Solo marca como pagado si el día de débito ya pasó en el mes indicado
      const debitDate = new Date(year, month - 1, s.debit_day);
      return debitDate <= today;
    })
    .map((s) => ({
      service_id: s.id,
      user_id: user.id,
      year,
      month,
      is_paid: true,
      paid_at: new Date().toISOString(),
    }));

  if (!rows.length) return { success: true };

  const { error } = await supabase
    .from("service_payments")
    .upsert(rows, { onConflict: "service_id,year,month", ignoreDuplicates: true });

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function upsertExchangeRate(
  year: number,
  month: number,
  usd_to_ars: number
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = exchangeRateSchema.safeParse({ year, month, usd_to_ars });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("exchange_rates")
    .upsert(
      { user_id: user.id, year, month, usd_to_ars },
      { onConflict: "user_id,year,month" }
    );

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}
