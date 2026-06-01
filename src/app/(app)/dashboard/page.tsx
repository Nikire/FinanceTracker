import { createClient } from "@/lib/supabase/server";
import { ResumenCards } from "./_components/ResumenCards";
import { GraficoBarras } from "./_components/GraficoBarras";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function getProximos30Dias(gastos: { due_date: string; amount: number }[]) {
  const hoy = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + 30);
  return gastos
    .filter((g) => {
      const fecha = new Date(g.due_date + "T12:00:00");
      return fecha >= hoy && fecha <= limite;
    })
    .reduce((sum, g) => sum + g.amount, 0);
}

// Convierte un monto a ARS unificado usando la cotización del tipo correspondiente
function toARS(amount: number, currency: string | null, rate: number | null): number {
  if (currency === "USD") return rate ? amount * rate : 0;
  return amount;
}

type ServiceRow = { amount: number; active: boolean; currency: string | null };
type IngresoRow = { amount: number; frequency: string; currency: string | null };

function sumGastos(services: ServiceRow[], rate: number | null) {
  return services
    .filter((s) => s.active)
    .reduce((sum, s) => sum + toARS(s.amount, s.currency, rate), 0);
}

// Suma todos los ingresos (mensual + anual + fijo) unificados a ARS
function sumIngresos(ingresos: IngresoRow[], rate: number | null) {
  return ingresos.reduce((sum, i) => sum + toARS(i.amount, i.currency, rate), 0);
}

// Cotización efectiva: la del mes actual o, si no existe, la más reciente cargada
function resolveRate(
  rates: { usd_to_ars: number; kind: string; year: number; month: number }[],
  kind: string,
  year: number,
  month: number
): number | null {
  const ofKind = rates.filter((r) => r.kind === kind);
  const current = ofKind.find((r) => r.year === year && r.month === month);
  if (current) return current.usd_to_ars;
  const latest = ofKind
    .slice()
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0];
  return latest?.usd_to_ars ?? null;
}

function buildChartData(
  services: ServiceRow[],
  ingresos: IngresoRow[],
  serviceRate: number | null,
  incomeRate: number | null
) {
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const hoy = new Date();

  return Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1);
    const mes = MESES[fecha.getMonth()];
    return {
      mes,
      ingresos: sumIngresos(ingresos, incomeRate),
      gastos: sumGastos(services, serviceRate),
    };
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [{ data: services }, { data: gastos }, { data: ingresos }, { data: rates }] =
    await Promise.all([
      supabase.from("services").select("amount, active, currency"),
      supabase.from("annual_expenses").select("due_date, amount"),
      supabase
        .from("income")
        .select("amount, frequency, currency")
        .eq("year", year)
        .eq("month", month),
      supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
    ]);

  const serviceRate = resolveRate(rates ?? [], "service", year, month);
  const incomeRate = resolveRate(rates ?? [], "income", year, month);

  const gastosMensuales = sumGastos((services ?? []) as ServiceRow[], serviceRate);
  const ingresosMensuales = sumIngresos((ingresos ?? []) as IngresoRow[], incomeRate);

  const balance = ingresosMensuales - gastosMensuales;
  const gastosAnualesProximos = getProximos30Dias(gastos ?? []);
  const chartData = buildChartData(
    (services ?? []) as ServiceRow[],
    (ingresos ?? []) as IngresoRow[],
    serviceRate,
    incomeRate
  );

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
          <CardTitle className="text-base">Últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <GraficoBarras data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}
