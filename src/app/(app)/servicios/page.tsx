import { createClient } from "@/lib/supabase/server";
import { ServiciosList } from "./_components/ServiciosList";

export const dynamic = "force-dynamic";

export default async function ServiciosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    { data: services },
    { data: records },
    { data: exchangeRates },
    { data: groups },
    { data: groupItems },
  ] = await Promise.all([
    supabase.from("services").select("*").order("name"),
    supabase.from("service_monthly_records").select("*").eq("user_id", user!.id),
    supabase.from("exchange_rates").select("*").eq("user_id", user!.id).eq("kind", "service"),
    supabase.from("groups").select("id, name, color").order("name"),
    supabase.from("group_items").select("group_id, entity_id").eq("entity_type", "service"),
  ]);

  const memberMap: Record<string, string[]> = {};
  for (const it of groupItems ?? []) (memberMap[it.entity_id] ??= []).push(it.group_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gastos mensuales fijos y recurrentes
        </p>
      </div>
      <ServiciosList
        services={services ?? []}
        records={records ?? []}
        exchangeRates={exchangeRates ?? []}
        groups={groups ?? []}
        memberMap={memberMap}
      />
    </div>
  );
}
