import { createClient } from "@/lib/supabase/server";
import { rateFor } from "@/lib/finance/calc";
import { GastosList } from "./_components/GastosList";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  const supabase = await createClient();

  const now = new Date();
  const [{ data: gastos }, { data: rates }] = await Promise.all([
    supabase.from("annual_expenses").select("*").order("due_date"),
    supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
  ]);

  // Cotización 'service' del mes actual para unificar montos en USD a ARS.
  const rate = rateFor(rates ?? [], "service", now.getFullYear(), now.getMonth() + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gastos anuales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gastos con fecha específica en el calendario
        </p>
      </div>
      <GastosList gastos={gastos ?? []} rate={rate} />
    </div>
  );
}
