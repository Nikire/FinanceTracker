import { createClient } from "@/lib/supabase/server";
import { ServiciosList } from "./_components/ServiciosList";

export default async function ServiciosPage() {
  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Servicios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gastos mensuales fijos y recurrentes
        </p>
      </div>
      <ServiciosList services={services ?? []} />
    </div>
  );
}
