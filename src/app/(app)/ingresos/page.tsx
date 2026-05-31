import { createClient } from "@/lib/supabase/server";
import { IngresosList } from "./_components/IngresosList";

export default async function IngresosPage() {
  const supabase = await createClient();
  const { data: ingresos } = await supabase
    .from("income")
    .select("*")
    .order("description");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ingresos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresos mensuales, anuales y fijos
        </p>
      </div>
      <IngresosList ingresos={ingresos ?? []} />
    </div>
  );
}
