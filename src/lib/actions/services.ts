"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceSchema, exchangeRateSchema, monthlyRecordSchema } from "@/lib/schemas/services";

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
    .from("service_monthly_records")
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
    .from("service_monthly_records")
    .upsert(
      { service_id: serviceId, user_id: user.id, year, month, is_active: isActive },
      { onConflict: "service_id,year,month" }
    );

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function updateMonthlyRecord(
  serviceId: string,
  year: number,
  month: number,
  formData: unknown
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = monthlyRecordSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("service_monthly_records")
    .upsert(
      {
        service_id: serviceId,
        user_id: user.id,
        year,
        month,
        amount: parsed.data.amount ?? null,
        currency: parsed.data.currency ?? null,
        notes: parsed.data.notes || null,
      },
      { onConflict: "service_id,year,month" }
    );

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

/** Inicializa el mes actual copiando los registros del mes anterior
 *  para servicios con recurrence = 'monthly'. */
export async function initializeMonth(year: number, month: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Calcular mes anterior
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  // Obtener servicios mensuales activos del usuario
  const { data: services } = await supabase
    .from("services")
    .select("id, recurrence")
    .eq("user_id", user.id)
    .eq("recurrence", "monthly");

  if (!services?.length) return { success: true, count: 0 };

  // Obtener registros del mes anterior para esos servicios
  const serviceIds = services.map((s) => s.id);
  const { data: prevRecords } = await supabase
    .from("service_monthly_records")
    .select("*")
    .in("service_id", serviceIds)
    .eq("year", prevYear)
    .eq("month", prevMonth);

  if (!prevRecords?.length) {
    // No hay registros previos — crear registros base para todos los servicios mensuales
    const rows = services.map((s) => ({
      service_id: s.id,
      user_id: user.id,
      year,
      month,
    }));
    const { error } = await supabase
      .from("service_monthly_records")
      .upsert(rows, { onConflict: "service_id,year,month", ignoreDuplicates: true });
    if (error) return { error: error.message };
    revalidatePath("/servicios");
    return { success: true, count: rows.length };
  }

  // Copiar registros del mes anterior manteniendo overrides de amount/currency/notes/is_active
  // Resetear is_paid (nuevo mes = no pagado aún)
  const rows = prevRecords.map((r) => ({
    service_id: r.service_id,
    user_id: user.id,
    year,
    month,
    amount: r.amount,
    currency: r.currency,
    notes: r.notes,
    is_active: r.is_active,
    is_paid: false,
  }));

  const { error } = await supabase
    .from("service_monthly_records")
    .upsert(rows, { onConflict: "service_id,year,month", ignoreDuplicates: true });

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true, count: rows.length };
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
    .from("service_monthly_records")
    .upsert(rows, { onConflict: "service_id,year,month", ignoreDuplicates: true });

  if (error) return { error: error.message };
  revalidatePath("/servicios");
  return { success: true };
}

export async function upsertExchangeRate(
  year: number,
  month: number,
  usd_to_ars: number,
  kind: "service" | "income" = "service"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = exchangeRateSchema.safeParse({ year, month, kind, usd_to_ars });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("exchange_rates")
    .upsert(
      { user_id: user.id, year, month, kind, usd_to_ars },
      { onConflict: "user_id,year,month,kind" }
    );

  if (error) return { error: error.message };
  revalidatePath(kind === "income" ? "/ingresos" : "/servicios");
  return { success: true };
}
