import type { AdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { serviceSchema, monthlyRecordSchema, exchangeRateSchema } from "@/lib/schemas/services";
import { incomeSchema } from "@/lib/schemas/income";
import { annualExpenseSchema } from "@/lib/schemas/annual-expenses";
import {
  resolvePeriod,
  periodLabel,
  shiftPeriod,
  currentPeriod,
  todayISO,
  type Period,
} from "./periods";
import {
  rateFor,
  effectiveActive,
  effectiveAmount,
  toARS,
  gastosDelMes,
  ingresosDelMes,
  type RecordRow,
  type RateRow,
} from "./calc";

/** Resultado uniforme: o trae `error`, o trae los datos de la operación. */
export type OpResult = Record<string, unknown> & { error?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { sb: AdminClient; userId: string };

// ─────────────────────────────────────────────────────────────────────────────
// Resolución de entidades por nombre/id (matching difuso)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveService(
  { sb, userId }: Ctx,
  ref: string
): Promise<{ service: Tables<"services"> } | { error: string }> {
  const { data, error } = await sb.from("services").select("*").eq("user_id", userId);
  if (error) return { error: error.message };
  const all = data ?? [];

  if (UUID_RE.test(ref.trim())) {
    const found = all.find((s) => s.id === ref.trim());
    return found ? { service: found } : { error: `No existe un servicio con id ${ref}` };
  }

  const q = ref.trim().toLowerCase();
  let matches = all.filter((s) => s.name.toLowerCase() === q);
  if (!matches.length) matches = all.filter((s) => s.name.toLowerCase().includes(q));
  if (!matches.length) {
    const names = all.map((s) => s.name).join(", ") || "(no hay servicios cargados)";
    return { error: `No encontré ningún servicio que coincida con "${ref}". Servicios disponibles: ${names}` };
  }
  if (matches.length > 1) {
    return {
      error: `Hay varios servicios que coinciden con "${ref}": ${matches
        .map((s) => `${s.name} (${s.id})`)
        .join(", ")}. Especificá cuál usando el nombre exacto o el id.`,
    };
  }
  return { service: matches[0] };
}

async function resolveAnnualExpense(
  { sb, userId }: Ctx,
  ref: string
): Promise<{ expense: Tables<"annual_expenses"> } | { error: string }> {
  const { data, error } = await sb.from("annual_expenses").select("*").eq("user_id", userId);
  if (error) return { error: error.message };
  const all = data ?? [];

  if (UUID_RE.test(ref.trim())) {
    const found = all.find((e) => e.id === ref.trim());
    return found ? { expense: found } : { error: `No existe un gasto anual con id ${ref}` };
  }

  const q = ref.trim().toLowerCase();
  let matches = all.filter((e) => e.name.toLowerCase() === q);
  if (!matches.length) matches = all.filter((e) => e.name.toLowerCase().includes(q));
  if (!matches.length) {
    const names = all.map((e) => e.name).join(", ") || "(no hay gastos anuales)";
    return { error: `No encontré ningún gasto anual que coincida con "${ref}". Disponibles: ${names}` };
  }
  if (matches.length > 1) {
    return {
      error: `Varios gastos anuales coinciden con "${ref}": ${matches
        .map((e) => `${e.name} (${e.id})`)
        .join(", ")}. Especificá cuál.`,
    };
  }
  return { expense: matches[0] };
}

async function resolveIncome(
  { sb, userId }: Ctx,
  ref: string,
  period?: { year?: number; month?: number; monthsAgo?: number }
): Promise<{ income: Tables<"income"> } | { error: string }> {
  let query = sb.from("income").select("*").eq("user_id", userId);
  if (period && (period.year != null || period.month != null || period.monthsAgo != null)) {
    const p = resolvePeriod(period);
    query = query.eq("year", p.year).eq("month", p.month);
  }
  const { data, error } = await query;
  if (error) return { error: error.message };
  const all = data ?? [];

  if (UUID_RE.test(ref.trim())) {
    const found = all.find((i) => i.id === ref.trim());
    return found ? { income: found } : { error: `No existe un ingreso con id ${ref}` };
  }

  const q = ref.trim().toLowerCase();
  let matches = all.filter((i) => i.description.toLowerCase() === q);
  if (!matches.length) matches = all.filter((i) => i.description.toLowerCase().includes(q));
  if (!matches.length) {
    return { error: `No encontré ningún ingreso que coincida con "${ref}". Usá list_income para ver los disponibles.` };
  }
  if (matches.length > 1) {
    return {
      error: `Varios ingresos coinciden con "${ref}": ${matches
        .map((i) => `${i.description} ${i.month}/${i.year} (${i.id})`)
        .join(", ")}. Especificá período (year/month) o el id.`,
    };
  }
  return { income: matches[0] };
}

async function loadRecords({ sb, userId }: Ctx): Promise<RecordRow[]> {
  const { data } = await sb.from("service_monthly_records").select("*").eq("user_id", userId);
  return (data ?? []) as RecordRow[];
}

async function loadRates({ sb, userId }: Ctx): Promise<RateRow[]> {
  const { data } = await sb
    .from("exchange_rates")
    .select("usd_to_ars, kind, year, month")
    .eq("user_id", userId);
  return (data ?? []) as RateRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Servicios
// ─────────────────────────────────────────────────────────────────────────────

export async function listServices(
  ctx: Ctx,
  args: { activeOnly?: boolean; year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const { data: services, error } = await ctx.sb
    .from("services")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("name");
  if (error) return { error: error.message };
  const records = await loadRecords(ctx);

  const list = (services ?? []).map((s) => {
    const active = effectiveActive(s, records, p.year, p.month);
    const { amount, currency } = effectiveAmount(s, records, p.year, p.month);
    const rec = records.find((r) => r.service_id === s.id && r.year === p.year && r.month === p.month);
    return {
      id: s.id,
      name: s.name,
      base_amount: s.amount,
      base_currency: s.currency,
      effective_amount: amount,
      effective_currency: currency,
      debit_day: s.debit_day,
      recurrence: s.recurrence,
      auto_debit: s.auto_debit,
      active,
      is_paid: rec?.is_paid ?? false,
      paid_at: rec?.paid_at ?? null,
      color: s.color,
      notes: s.notes,
    };
  });

  const filtered = args.activeOnly ? list.filter((s) => s.active) : list;
  return { period: periodLabel(p), count: filtered.length, services: filtered };
}

export async function getService(ctx: Ctx, args: { service: string }): Promise<OpResult> {
  const r = await resolveService(ctx, args.service);
  if ("error" in r) return r;
  const { data: records } = await ctx.sb
    .from("service_monthly_records")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("service_id", r.service.id)
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(12);
  return { service: r.service, recent_monthly_records: records ?? [] };
}

export async function createService(
  ctx: Ctx,
  args: {
    name: string;
    amount: number;
    debit_day?: number;
    currency?: "ARS" | "USD";
    recurrence?: "monthly" | "one_time";
    auto_debit?: boolean;
    active?: boolean;
    color?: string | null;
    notes?: string;
  }
): Promise<OpResult> {
  const payload = {
    name: args.name,
    amount: args.amount,
    debit_day: args.debit_day ?? 1,
    currency: args.currency ?? "ARS",
    recurrence: args.recurrence ?? "monthly",
    auto_debit: args.auto_debit ?? false,
    active: args.active ?? true,
    color: args.color ?? null,
    notes: args.notes ?? "",
  };
  const parsed = serviceSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("services")
    .insert({ ...parsed.data, notes: parsed.data.notes || null, user_id: ctx.userId })
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, created: data };
}

export async function updateService(
  ctx: Ctx,
  args: {
    service: string;
    name?: string;
    amount?: number;
    debit_day?: number;
    currency?: "ARS" | "USD";
    recurrence?: "monthly" | "one_time";
    auto_debit?: boolean;
    active?: boolean;
    color?: string | null;
    notes?: string;
  }
): Promise<OpResult> {
  const r = await resolveService(ctx, args.service);
  if ("error" in r) return r;
  const cur = r.service;

  // Merge sobre el servicio actual, validando el objeto completo.
  const merged = {
    name: args.name ?? cur.name,
    amount: args.amount ?? cur.amount,
    debit_day: args.debit_day ?? cur.debit_day,
    currency: args.currency ?? cur.currency,
    recurrence: args.recurrence ?? cur.recurrence,
    auto_debit: args.auto_debit ?? cur.auto_debit,
    active: args.active ?? cur.active,
    color: args.color !== undefined ? args.color : cur.color,
    notes: args.notes ?? cur.notes ?? "",
  };
  const parsed = serviceSchema.safeParse(merged);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("services")
    .update({ ...parsed.data, notes: parsed.data.notes || null })
    .eq("id", cur.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, updated: data };
}

export async function deleteService(ctx: Ctx, args: { service: string }): Promise<OpResult> {
  const r = await resolveService(ctx, args.service);
  if ("error" in r) return r;
  const { error } = await ctx.sb
    .from("services")
    .delete()
    .eq("id", r.service.id)
    .eq("user_id", ctx.userId);
  if (error) return { error: error.message };
  return { success: true, deleted: { id: r.service.id, name: r.service.name } };
}

export async function setServicePayment(
  ctx: Ctx,
  args: { service: string; isPaid: boolean; year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const r = await resolveService(ctx, args.service);
  if ("error" in r) return r;
  const p = resolvePeriod(args);

  const { error } = await ctx.sb.from("service_monthly_records").upsert(
    {
      service_id: r.service.id,
      user_id: ctx.userId,
      year: p.year,
      month: p.month,
      is_paid: args.isPaid,
      paid_at: args.isPaid ? new Date().toISOString() : null,
    },
    { onConflict: "service_id,year,month" }
  );
  if (error) return { error: error.message };
  return {
    success: true,
    service: r.service.name,
    period: periodLabel(p),
    is_paid: args.isPaid,
  };
}

export async function setServiceMonthAmount(
  ctx: Ctx,
  args: {
    service: string;
    amount?: number;
    currency?: "ARS" | "USD";
    notes?: string;
    year?: number;
    month?: number;
    monthsAgo?: number;
  }
): Promise<OpResult> {
  const r = await resolveService(ctx, args.service);
  if ("error" in r) return r;
  const p = resolvePeriod(args);

  const parsed = monthlyRecordSchema.safeParse({
    amount: args.amount,
    currency: args.currency,
    notes: args.notes,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await ctx.sb.from("service_monthly_records").upsert(
    {
      service_id: r.service.id,
      user_id: ctx.userId,
      year: p.year,
      month: p.month,
      amount: parsed.data.amount ?? null,
      currency: parsed.data.currency ?? null,
      notes: parsed.data.notes || null,
    },
    { onConflict: "service_id,year,month" }
  );
  if (error) return { error: error.message };
  return {
    success: true,
    service: r.service.name,
    period: periodLabel(p),
    override: { amount: parsed.data.amount ?? null, currency: parsed.data.currency ?? null },
  };
}

export async function setServiceActive(
  ctx: Ctx,
  args: {
    service: string;
    active: boolean;
    scope?: "month" | "global";
    year?: number;
    month?: number;
    monthsAgo?: number;
  }
): Promise<OpResult> {
  const r = await resolveService(ctx, args.service);
  if ("error" in r) return r;
  const scope = args.scope ?? "global";

  if (scope === "global") {
    const { error } = await ctx.sb
      .from("services")
      .update({ active: args.active })
      .eq("id", r.service.id)
      .eq("user_id", ctx.userId);
    if (error) return { error: error.message };
    return { success: true, service: r.service.name, scope, active: args.active };
  }

  const p = resolvePeriod(args);
  const { error } = await ctx.sb.from("service_monthly_records").upsert(
    { service_id: r.service.id, user_id: ctx.userId, year: p.year, month: p.month, is_active: args.active },
    { onConflict: "service_id,year,month" }
  );
  if (error) return { error: error.message };
  return { success: true, service: r.service.name, scope, period: periodLabel(p), active: args.active };
}

export async function initializeMonth(
  ctx: Ctx,
  args: { year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const prev = shiftPeriod(p.year, p.month, -1);

  const { data: services } = await ctx.sb
    .from("services")
    .select("id, recurrence")
    .eq("user_id", ctx.userId)
    .eq("recurrence", "monthly");
  if (!services?.length) return { success: true, period: periodLabel(p), count: 0 };

  const serviceIds = services.map((s) => s.id);
  const { data: prevRecords } = await ctx.sb
    .from("service_monthly_records")
    .select("*")
    .eq("user_id", ctx.userId)
    .in("service_id", serviceIds)
    .eq("year", prev.year)
    .eq("month", prev.month);

  const rows = prevRecords?.length
    ? prevRecords.map((rec) => ({
        service_id: rec.service_id,
        user_id: ctx.userId,
        year: p.year,
        month: p.month,
        amount: rec.amount,
        currency: rec.currency,
        notes: rec.notes,
        is_active: rec.is_active,
        is_paid: false,
      }))
    : services.map((s) => ({ service_id: s.id, user_id: ctx.userId, year: p.year, month: p.month }));

  const { error } = await ctx.sb
    .from("service_monthly_records")
    .upsert(rows, { onConflict: "service_id,year,month", ignoreDuplicates: true });
  if (error) return { error: error.message };
  return { success: true, period: periodLabel(p), count: rows.length };
}

export async function autoMarkPaid(
  ctx: Ctx,
  args: { year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const { data: services } = await ctx.sb
    .from("services")
    .select("id, name, debit_day")
    .eq("user_id", ctx.userId)
    .eq("active", true)
    .eq("auto_debit", true);
  if (!services?.length) return { success: true, period: periodLabel(p), marked: [] };

  const today = new Date();
  const due = services.filter((s) => new Date(p.year, p.month - 1, s.debit_day) <= today);
  if (!due.length) return { success: true, period: periodLabel(p), marked: [] };

  const rows = due.map((s) => ({
    service_id: s.id,
    user_id: ctx.userId,
    year: p.year,
    month: p.month,
    is_paid: true,
    paid_at: new Date().toISOString(),
  }));
  const { error } = await ctx.sb
    .from("service_monthly_records")
    .upsert(rows, { onConflict: "service_id,year,month", ignoreDuplicates: true });
  if (error) return { error: error.message };
  return { success: true, period: periodLabel(p), marked: due.map((s) => s.name) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingresos
// ─────────────────────────────────────────────────────────────────────────────

export async function listIncome(
  ctx: Ctx,
  args: { year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const { data, error } = await ctx.sb
    .from("income")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("year", p.year)
    .eq("month", p.month)
    .order("created_at");
  if (error) return { error: error.message };
  return { period: periodLabel(p), count: data?.length ?? 0, income: data ?? [] };
}

export async function createIncome(
  ctx: Ctx,
  args: {
    description: string;
    amount: number;
    frequency: "monthly" | "annual" | "fixed";
    currency?: "ARS" | "USD";
    color?: string | null;
    notes?: string;
    year?: number;
    month?: number;
    monthsAgo?: number;
  }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const parsed = incomeSchema.safeParse({
    description: args.description,
    amount: args.amount,
    frequency: args.frequency,
    currency: args.currency ?? "ARS",
    color: args.color ?? null,
    notes: args.notes ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("income")
    .insert({
      ...parsed.data,
      notes: parsed.data.notes || null,
      color: parsed.data.color || null,
      year: p.year,
      month: p.month,
      user_id: ctx.userId,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, period: periodLabel(p), created: data };
}

export async function updateIncome(
  ctx: Ctx,
  args: {
    income: string;
    description?: string;
    amount?: number;
    frequency?: "monthly" | "annual" | "fixed";
    currency?: "ARS" | "USD";
    color?: string | null;
    notes?: string;
    year?: number;
    month?: number;
    monthsAgo?: number;
  }
): Promise<OpResult> {
  const r = await resolveIncome(ctx, args.income, args);
  if ("error" in r) return r;
  const cur = r.income;

  const merged = {
    description: args.description ?? cur.description,
    amount: args.amount ?? cur.amount,
    frequency: args.frequency ?? cur.frequency,
    currency: args.currency ?? cur.currency,
    color: args.color !== undefined ? args.color : cur.color,
    notes: args.notes ?? cur.notes ?? "",
  };
  const parsed = incomeSchema.safeParse(merged);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("income")
    .update({ ...parsed.data, notes: parsed.data.notes || null, color: parsed.data.color || null })
    .eq("id", cur.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, updated: data };
}

export async function deleteIncome(
  ctx: Ctx,
  args: { income: string; year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const r = await resolveIncome(ctx, args.income, args);
  if ("error" in r) return r;
  const { error } = await ctx.sb
    .from("income")
    .delete()
    .eq("id", r.income.id)
    .eq("user_id", ctx.userId);
  if (error) return { error: error.message };
  return { success: true, deleted: { id: r.income.id, description: r.income.description } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gastos anuales
// ─────────────────────────────────────────────────────────────────────────────

export async function listAnnualExpenses(
  ctx: Ctx,
  args: { upcomingDays?: number }
): Promise<OpResult> {
  const { data, error } = await ctx.sb
    .from("annual_expenses")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("due_date");
  if (error) return { error: error.message };
  let list = data ?? [];

  if (args.upcomingDays != null) {
    const hoy = todayISO();
    const limite = new Date(Date.now() + args.upcomingDays * 86400000).toISOString().slice(0, 10);
    list = list.filter((e) => e.due_date >= hoy && e.due_date <= limite);
  }

  // Total unificado en ARS con la cotización 'service' del mes actual.
  const cur = currentPeriod();
  const rate = rateFor(await loadRates(ctx), "service", cur.year, cur.month);
  const totalArs = list.reduce((sum, e) => sum + toARS(e.amount, e.currency, rate), 0);
  return {
    count: list.length,
    total_ars: Math.round(totalArs * 100) / 100,
    service_usd_to_ars: rate,
    annual_expenses: list,
  };
}

export async function createAnnualExpense(
  ctx: Ctx,
  args: {
    name: string;
    amount: number;
    due_date: string;
    currency?: "ARS" | "USD";
    recurring?: boolean;
    notes?: string;
  }
): Promise<OpResult> {
  const parsed = annualExpenseSchema.safeParse({
    name: args.name,
    amount: args.amount,
    currency: args.currency ?? "ARS",
    due_date: args.due_date,
    recurring: args.recurring ?? false,
    notes: args.notes ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("annual_expenses")
    .insert({ ...parsed.data, notes: parsed.data.notes || null, user_id: ctx.userId })
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, created: data };
}

export async function updateAnnualExpense(
  ctx: Ctx,
  args: {
    expense: string;
    name?: string;
    amount?: number;
    currency?: "ARS" | "USD";
    due_date?: string;
    recurring?: boolean;
    notes?: string;
  }
): Promise<OpResult> {
  const r = await resolveAnnualExpense(ctx, args.expense);
  if ("error" in r) return r;
  const cur = r.expense;

  const merged = {
    name: args.name ?? cur.name,
    amount: args.amount ?? cur.amount,
    currency: args.currency ?? cur.currency,
    due_date: args.due_date ?? cur.due_date,
    recurring: args.recurring ?? cur.recurring,
    notes: args.notes ?? cur.notes ?? "",
  };
  const parsed = annualExpenseSchema.safeParse(merged);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await ctx.sb
    .from("annual_expenses")
    .update({ ...parsed.data, notes: parsed.data.notes || null })
    .eq("id", cur.id)
    .eq("user_id", ctx.userId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { success: true, updated: data };
}

export async function deleteAnnualExpense(ctx: Ctx, args: { expense: string }): Promise<OpResult> {
  const r = await resolveAnnualExpense(ctx, args.expense);
  if ("error" in r) return r;
  const { error } = await ctx.sb
    .from("annual_expenses")
    .delete()
    .eq("id", r.expense.id)
    .eq("user_id", ctx.userId);
  if (error) return { error: error.message };
  return { success: true, deleted: { id: r.expense.id, name: r.expense.name } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cotizaciones (tipo de cambio)
// ─────────────────────────────────────────────────────────────────────────────

export async function getExchangeRate(
  ctx: Ctx,
  args: { kind?: "service" | "income"; year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const kind = args.kind ?? "service";
  const rates = await loadRates(ctx);
  const rate = rateFor(rates, kind, p.year, p.month);
  const exact = rates.find((r) => r.kind === kind && r.year === p.year && r.month === p.month);
  return {
    period: periodLabel(p),
    kind,
    usd_to_ars: rate,
    is_exact_for_period: !!exact,
  };
}

export async function setExchangeRate(
  ctx: Ctx,
  args: { usd_to_ars: number; kind?: "service" | "income"; year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const kind = args.kind ?? "service";
  const parsed = exchangeRateSchema.safeParse({ year: p.year, month: p.month, kind, usd_to_ars: args.usd_to_ars });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await ctx.sb
    .from("exchange_rates")
    .upsert(
      { user_id: ctx.userId, year: p.year, month: p.month, kind, usd_to_ars: args.usd_to_ars },
      { onConflict: "user_id,year,month,kind" }
    );
  if (error) return { error: error.message };
  return { success: true, period: periodLabel(p), kind, usd_to_ars: args.usd_to_ars };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

export async function getPendingPayments(
  ctx: Ctx,
  args: { year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const { data: services, error } = await ctx.sb
    .from("services")
    .select("*")
    .eq("user_id", ctx.userId);
  if (error) return { error: error.message };
  const records = await loadRecords(ctx);
  const rates = await loadRates(ctx);
  const rate = rateFor(rates, "service", p.year, p.month);

  const pending = (services ?? [])
    .filter((s) => effectiveActive(s, records, p.year, p.month))
    .filter((s) => {
      const rec = records.find((r) => r.service_id === s.id && r.year === p.year && r.month === p.month);
      return !(rec?.is_paid ?? false);
    })
    .map((s) => {
      const { amount, currency } = effectiveAmount(s, records, p.year, p.month);
      return {
        id: s.id,
        name: s.name,
        amount,
        currency,
        amount_ars: toARS(amount, currency, rate),
        debit_day: s.debit_day,
      };
    })
    .sort((a, b) => a.debit_day - b.debit_day);

  const totalArs = pending.reduce((sum, s) => sum + s.amount_ars, 0);
  return {
    period: periodLabel(p),
    pending_count: pending.length,
    total_pending_ars: Math.round(totalArs * 100) / 100,
    service_usd_to_ars: rate,
    pending,
  };
}

export async function getMonthlySummary(
  ctx: Ctx,
  args: { year?: number; month?: number; monthsAgo?: number }
): Promise<OpResult> {
  const p = resolvePeriod(args);
  const [{ data: services }, { data: income }, { data: annual }, { data: cardInsts }] = await Promise.all([
    ctx.sb.from("services").select("*").eq("user_id", ctx.userId),
    ctx.sb.from("income").select("*").eq("user_id", ctx.userId),
    ctx.sb.from("annual_expenses").select("due_date, amount, currency").eq("user_id", ctx.userId),
    ctx.sb
      .from("card_installments")
      .select("amount, year, month, card_purchases(currency)")
      .eq("user_id", ctx.userId)
      .eq("year", p.year)
      .eq("month", p.month),
  ]);
  const records = await loadRecords(ctx);
  const rates = await loadRates(ctx);
  const rateServ = rateFor(rates, "service", p.year, p.month);

  const cardGastos = (cardInsts ?? []).reduce((sum, i) => {
    const cur = (i.card_purchases as unknown as { currency: string | null } | null)?.currency ?? "ARS";
    return sum + toARS(i.amount, cur, rateServ);
  }, 0);

  const gastos = gastosDelMes(services ?? [], records, rates, p.year, p.month) + cardGastos;
  const ingresos = ingresosDelMes(income ?? [], rates, p.year, p.month);

  // Pendientes del mes
  const rate = rateFor(rates, "service", p.year, p.month);
  const pending = (services ?? [])
    .filter((s) => effectiveActive(s, records, p.year, p.month))
    .filter((s) => {
      const rec = records.find((r) => r.service_id === s.id && r.year === p.year && r.month === p.month);
      return !(rec?.is_paid ?? false);
    });
  const pendingArs = pending.reduce((sum, s) => {
    const { amount, currency } = effectiveAmount(s, records, p.year, p.month);
    return sum + toARS(amount, currency, rate);
  }, 0);

  // Gastos anuales próximos 30 días
  const hoy = todayISO();
  const limite = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const proximosAnuales = (annual ?? [])
    .filter((e) => e.due_date >= hoy && e.due_date <= limite)
    .reduce((sum, e) => sum + toARS(e.amount, e.currency, rate), 0);

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    period: periodLabel(p),
    ingresos_ars: round(ingresos),
    gastos_ars: round(gastos),
    gastos_tarjeta_ars: round(cardGastos),
    balance_ars: round(ingresos - gastos),
    pendientes_count: pending.length,
    pendientes_ars: round(pendingArs),
    gastos_anuales_proximos_30d_ars: round(proximosAnuales),
    cotizacion_servicios: rateFor(rates, "service", p.year, p.month),
    cotizacion_ingresos: rateFor(rates, "income", p.year, p.month),
  };
}

export async function getFinancialOverview(ctx: Ctx): Promise<OpResult> {
  const cur = currentPeriod();
  const [{ count: serviceCount }, { count: incomeCount }, { count: annualCount }] = await Promise.all([
    ctx.sb.from("services").select("*", { count: "exact", head: true }).eq("user_id", ctx.userId),
    ctx.sb.from("income").select("*", { count: "exact", head: true }).eq("user_id", ctx.userId),
    ctx.sb.from("annual_expenses").select("*", { count: "exact", head: true }).eq("user_id", ctx.userId),
  ]);

  const summary = await getMonthlySummary(ctx, {});
  const upcoming = await listAnnualExpenses(ctx, { upcomingDays: 60 });

  return {
    current_period: periodLabel(cur),
    today: todayISO(),
    totals: {
      services: serviceCount ?? 0,
      income_entries: incomeCount ?? 0,
      annual_expenses: annualCount ?? 0,
    },
    current_month: summary,
    upcoming_annual_expenses_60d: upcoming.annual_expenses,
  };
}

export function getCurrentPeriod(): OpResult {
  const cur = currentPeriod();
  return { year: cur.year, month: cur.month, label: periodLabel(cur), today: todayISO() };
}
