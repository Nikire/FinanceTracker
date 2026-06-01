import { createClient } from "@/lib/supabase/server";
import { GastosList } from "./_components/GastosList";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  const supabase = await createClient();
  const { data: gastos } = await supabase
    .from("annual_expenses")
    .select("*")
    .order("due_date");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gastos anuales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gastos con fecha específica en el calendario
        </p>
      </div>
      <GastosList gastos={gastos ?? []} />
    </div>
  );
}
