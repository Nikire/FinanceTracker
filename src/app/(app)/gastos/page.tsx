import { createClient } from "@/lib/supabase/server";
import { rateFor } from "@/lib/finance/calc";
import { GastosList } from "./_components/GastosList";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  const supabase = await createClient();

  const now = new Date();
  const [{ data: gastos }, { data: rates }, { data: groups }, { data: groupItems }] = await Promise.all([
    supabase.from("annual_expenses").select("*").order("due_date"),
    supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
    supabase.from("groups").select("id, name, color").order("name"),
    supabase.from("group_items").select("group_id, entity_id").eq("entity_type", "annual_expense"),
  ]);

  const memberMap: Record<string, string[]> = {};
  for (const it of groupItems ?? []) (memberMap[it.entity_id] ??= []).push(it.group_id);

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
      <GastosList gastos={gastos ?? []} rate={rate} groups={groups ?? []} memberMap={memberMap} />
    </div>
  );
}
