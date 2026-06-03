import { createClient } from "@/lib/supabase/server";
import { Tables } from "@/lib/supabase/database.types";
import { ResumenCards } from "./_components/ResumenCards";
import { GraficoBarras } from "./_components/GraficoBarras";
import { GastosPorServicio } from "./_components/GastosPorServicio";
import { ComposicionGastos } from "./_components/ComposicionGastos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";

// Datos por usuario que cambian seguido: siempre renderizar con la DB actual
export const dynamic = "force-dynamic";

function getProximos30Dias(
  gastos: { due_date: string; amount: number; currency: string | null }[],
  rate: number | null
) {
  const hoy = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + 30);
  return gastos
    .filter((g) => {
      const fecha = new Date(g.due_date + "T12:00:00");
      return fecha >= hoy && fecha <= limite;
    })
    .reduce((sum, g) => sum + toARS(g.amount, g.currency, rate), 0);
}

// Convierte un monto a ARS unificado usando la cotización del tipo correspondiente
function toARS(amount: number, currency: string | null, rate: number | null): number {
  if (currency === "USD") return rate ? amount * rate : 0;
  return amount;
}

type ServiceRow = { id: string; name: string; amount: number; active: boolean; currency: string | null; color: string | null };
type RecordRow = Tables<"service_monthly_records">;
type IngresoRow = { amount: number; currency: string | null; year: number; month: number };
type RateRow = { usd_to_ars: number; kind: string; year: number; month: number };

const ym = (year: number, month: number) => year * 12 + month;

// Cotización del mes: exacta, o la más reciente cargada hasta ese mes, o la primera disponible
function rateFor(rates: RateRow[], kind: string, year: number, month: number): number | null {
  const ofKind = rates
    .filter((r) => r.kind === kind)
    .sort((a, b) => ym(a.year, a.month) - ym(b.year, b.month));
  const exact = ofKind.find((r) => r.year === year && r.month === month);
  if (exact) return exact.usd_to_ars;
  const before = ofKind.filter((r) => ym(r.year, r.month) <= ym(year, month));
  if (before.length) return before[before.length - 1].usd_to_ars;
  return ofKind[0]?.usd_to_ars ?? null;
}

// Estado activo efectivo de un servicio en un mes (busca hacia atrás, cae en service.active)
function effectiveActive(service: ServiceRow, records: RecordRow[], year: number, month: number): boolean {
  const relevant = records
    .filter((r) => r.service_id === service.id && r.is_active !== null)
    .filter((r) => r.year < year || (r.year === year && r.month <= month))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  if (relevant.length > 0) return relevant[0].is_active!;
  return service.active;
}

// Gastos del mes: servicios activos, con monto/moneda efectivos y cotización saliente del mes
function gastosDelMes(
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
      const rec = records.find((r) => r.service_id === s.id && r.year === year && r.month === month);
      const amount = rec?.amount ?? s.amount;
      const currency = rec?.currency ?? s.currency;
      return sum + toARS(amount, currency, rate);
    }, 0);
}

// Ingresos del mes (pertenecen a un mes específico), unificados con la cotización entrante del mes
function ingresosDelMes(ingresos: IngresoRow[], rates: RateRow[], year: number, month: number): number {
  const rate = rateFor(rates, "income", year, month);
  return ingresos
    .filter((i) => i.year === year && i.month === month)
    .reduce((sum, i) => sum + toARS(i.amount, i.currency, rate), 0);
}

function buildChartData(
  services: ServiceRow[],
  records: RecordRow[],
  ingresos: IngresoRow[],
  rates: RateRow[]
) {
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const hoy = new Date();

  return Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1);
    const y = fecha.getFullYear();
    const m = fecha.getMonth() + 1;
    return {
      mes: MESES[fecha.getMonth()],
      ingresos: ingresosDelMes(ingresos, rates, y, m),
      gastos: gastosDelMes(services, records, rates, y, m),
    };
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    { data: services },
    { data: records },
    { data: gastos },
    { data: ingresos },
    { data: rates },
  ] = await Promise.all([
    supabase.from("services").select("id, name, amount, active, currency, color"),
    supabase.from("service_monthly_records").select("*"),
    supabase.from("annual_expenses").select("due_date, amount, currency"),
    supabase.from("income").select("amount, currency, year, month"),
    supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
  ]);

  const serviceList = (services ?? []) as ServiceRow[];
  const recordList = (records ?? []) as RecordRow[];
  const ingresoList = (ingresos ?? []) as IngresoRow[];
  const rateList = (rates ?? []) as RateRow[];

  const gastosMensuales = gastosDelMes(serviceList, recordList, rateList, year, month);
  const ingresosMensuales = ingresosDelMes(ingresoList, rateList, year, month);

  const balance = ingresosMensuales - gastosMensuales;
  const gastosAnualesProximos = getProximos30Dias(
    gastos ?? [],
    rateFor(rateList, "service", year, month)
  );
  const chartData = buildChartData(serviceList, recordList, ingresoList, rateList);

  // Gastos del mes por servicio (en ARS), con el color de cada servicio
  const rateServ = rateFor(rateList, "service", year, month);
  const gastosPorServicio = serviceList
    .filter((s) => effectiveActive(s, recordList, year, month))
    .map((s) => {
      const rec = recordList.find((r) => r.service_id === s.id && r.year === year && r.month === month);
      const amount = rec?.amount ?? s.amount;
      const currency = rec?.currency ?? s.currency;
      return { name: s.name, ars: toARS(amount, currency, rateServ), color: s.color ?? "#6366f1" };
    })
    .filter((d) => d.ars > 0)
    .sort((a, b) => b.ars - a.ars)
    .slice(0, 10);

  // Mes con mayor gasto en los últimos 6
  const mesMayorGasto = chartData.reduce((max, d) => (d.gastos > max.gastos ? d : max), chartData[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Resumen financiero</p>
      </div>

      <ResumenCards
        ingresosMensuales={ingresosMensuales}
        gastosMensuales={gastosMensuales}
        balance={balance}
        gastosAnualesProximos={gastosAnualesProximos}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingresos vs Gastos (últimos 6 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <GraficoBarras data={chartData} />
          {mesMayorGasto && mesMayorGasto.gastos > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Mes de mayor gasto:{" "}
              <span className="font-medium text-foreground">{mesMayorGasto.mes}</span> (
              {formatCurrency(mesMayorGasto.gastos)})
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gastos del mes por servicio</CardTitle>
          </CardHeader>
          <CardContent>
            <GastosPorServicio data={gastosPorServicio} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Composición de gastos del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <ComposicionGastos mensual={gastosMensuales} anual={gastosAnualesProximos} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
