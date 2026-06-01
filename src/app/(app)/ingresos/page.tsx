import { createClient } from "@/lib/supabase/server";
import { IngresosList } from "./_components/IngresosList";

export default async function IngresosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: ingresos }, { data: exchangeRates }] = await Promise.all([
    supabase.from("income").select("*").order("description"),
    supabase.from("exchange_rates").select("*").eq("user_id", user!.id).eq("kind", "income"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingresos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresos mensuales, anuales y fijos
        </p>
      </div>
      <IngresosList ingresos={ingresos ?? []} exchangeRates={exchangeRates ?? []} />
    </div>
  );
}
