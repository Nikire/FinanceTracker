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

function buildChartData(
  services: { amount: number; active: boolean }[],
  ingresos: { amount: number; frequency: string }[]
) {
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const hoy = new Date();

  return Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1);
    const mes = MESES[fecha.getMonth()];

    const gastos = services
      .filter((s) => s.active)
      .reduce((sum, s) => sum + s.amount, 0);

    const ingresosTotal = ingresos
      .filter((ing) => ing.frequency === "monthly")
      .reduce((sum, ing) => sum + ing.amount, 0);

    return { mes, ingresos: ingresosTotal, gastos };
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: services }, { data: gastos }, { data: ingresos }] = await Promise.all([
    supabase.from("services").select("amount, active"),
    supabase.from("annual_expenses").select("due_date, amount"),
    supabase.from("income").select("amount, frequency"),
  ]);

  const gastosMensuales = (services ?? [])
    .filter((s) => s.active)
    .reduce((sum, s) => sum + s.amount, 0);

  const ingresosMensuales = (ingresos ?? [])
    .filter((i) => i.frequency === "monthly")
    .reduce((sum, i) => sum + i.amount, 0);

  const balance = ingresosMensuales - gastosMensuales;
  const gastosAnualesProximos = getProximos30Dias(gastos ?? []);
  const chartData = buildChartData(services ?? [], ingresos ?? []);

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
