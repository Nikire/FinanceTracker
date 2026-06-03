import { createClient } from "@/lib/supabase/server";
import { IngresosList } from "./_components/IngresosList";

export const dynamic = "force-dynamic";

export default async function IngresosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: ingresos },
    { data: exchangeRates },
    { data: groups },
    { data: groupItems },
  ] = await Promise.all([
    supabase.from("income").select("*").order("description"),
    supabase.from("exchange_rates").select("*").eq("user_id", user!.id).eq("kind", "income"),
    supabase.from("groups").select("id, name, color").order("name"),
    supabase.from("group_items").select("group_id, entity_id").eq("entity_type", "income"),
  ]);

  const memberMap: Record<string, string[]> = {};
  for (const it of groupItems ?? []) (memberMap[it.entity_id] ??= []).push(it.group_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingresos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresos mensuales, anuales y fijos
        </p>
      </div>
      <IngresosList
        ingresos={ingresos ?? []}
        exchangeRates={exchangeRates ?? []}
        groups={groups ?? []}
        memberMap={memberMap}
      />
    </div>
  );
}
