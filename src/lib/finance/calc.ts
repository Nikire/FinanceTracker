import type { Tables } from "@/lib/supabase/database.types";

/**
 * Lógica de cálculo financiero compartida, espejo de la del dashboard
 * (src/app/(app)/dashboard/page.tsx). Centralizada acá para que el servidor MCP
 * reporte exactamente los mismos números que la web.
 */

export type ServiceRow = Tables<"services">;
export type RecordRow = Tables<"service_monthly_records">;
export type IncomeRow = Tables<"income">;
export type RateRow = Pick<Tables<"exchange_rates">, "usd_to_ars" | "kind" | "year" | "month">;

const ym = (year: number, month: number) => year * 12 + month;

/** Convierte un monto a ARS unificado usando la cotización correspondiente. */
export function toARS(amount: number, currency: string | null, rate: number | null): number {
  if (currency === "USD") return rate ? amount * rate : 0;
  return amount;
}

/** Cotización del mes: exacta, o la más reciente hasta ese mes, o la primera disponible. */
export function rateFor(
  rates: RateRow[],
  kind: "service" | "income",
  year: number,
  month: number
): number | null {
  const ofKind = rates
    .filter((r) => r.kind === kind)
    .sort((a, b) => ym(a.year, a.month) - ym(b.year, b.month));
  const exact = ofKind.find((r) => r.year === year && r.month === month);
  if (exact) return exact.usd_to_ars;
  const before = ofKind.filter((r) => ym(r.year, r.month) <= ym(year, month));
  if (before.length) return before[before.length - 1].usd_to_ars;
  return ofKind[0]?.usd_to_ars ?? null;
}

/** Estado activo efectivo de un servicio en un mes (busca hacia atrás, cae en service.active). */
/**
 * Mes de inicio de un servicio (ym): el más temprano con registro mensual, o el
 * mes de creación si no tiene registros. Un servicio no cuenta antes de su inicio.
 */
export function serviceStartYm(
  service: Pick<ServiceRow, "id" | "created_at">,
  records: RecordRow[]
): number {
  const recs = records.filter((r) => r.service_id === service.id);
  if (recs.length) return Math.min(...recs.map((r) => ym(r.year, r.month)));
  const d = new Date(service.created_at);
  return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export function effectiveActive(
  service: Pick<ServiceRow, "id" | "active" | "created_at">,
  records: RecordRow[],
  year: number,
  month: number
): boolean {
  // Antes del mes de inicio el servicio no existe → no cuenta.
  if (ym(year, month) < serviceStartYm(service, records)) return false;
  const relevant = records
    .filter((r) => r.service_id === service.id && r.is_active !== null)
    .filter((r) => r.year < year || (r.year === year && r.month <= month))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  if (relevant.length > 0) return relevant[0].is_active!;
  return service.active;
}

/** Monto y moneda efectivos de un servicio para un mes (considera overrides del registro mensual). */
export function effectiveAmount(
  service: Pick<ServiceRow, "id" | "amount" | "currency">,
  records: RecordRow[],
  year: number,
  month: number
): { amount: number; currency: string } {
  const rec = records.find(
    (r) => r.service_id === service.id && r.year === year && r.month === month
  );
  return {
    amount: rec?.amount ?? service.amount,
    currency: rec?.currency ?? service.currency,
  };
}

/** Gastos totales del mes en ARS (servicios activos con monto/moneda efectivos). */
export function gastosDelMes(
  services: ServiceRow[],
  records: RecordRow[],
  rates: RateRow[],
  year: number,
  month: number
): number {
  const rate = rateFor(rates, "service", year, month);
  return services
    .filter((s) => effectiveActive(s, records, year, month))
    .reduce((sum, s) => {
      const { amount, currency } = effectiveAmount(s, records, year, month);
      return sum + toARS(amount, currency, rate);
    }, 0);
}

/** Ingresos totales del mes en ARS. */
export function ingresosDelMes(
  ingresos: IncomeRow[],
  rates: RateRow[],
  year: number,
  month: number
): number {
  const rate = rateFor(rates, "income", year, month);
  return ingresos
    .filter((i) => i.year === year && i.month === month)
    .reduce((sum, i) => sum + toARS(i.amount, i.currency, rate), 0);
}
