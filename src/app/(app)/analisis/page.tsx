import { createClient } from "@/lib/supabase/server";
import { AnalisisView } from "./_components/AnalisisView";

export const dynamic = "force-dynamic";

export default async function AnalisisPage() {
  const supabase = await createClient();

  const [
    { data: services },
    { data: records },
    { data: cardInsts },
    { data: annual },
    { data: income },
    { data: rates },
    { data: groups },
    { data: groupItems },
  ] = await Promise.all([
    supabase.from("services").select("*"),
    supabase.from("service_monthly_records").select("*"),
    supabase
      .from("card_installments")
      .select("amount, year, month, purchase_id, card_purchases(description, currency)"),
    supabase.from("annual_expenses").select("*"),
    supabase.from("income").select("*"),
    supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
    supabase.from("groups").select("id, name, color"),
    supabase.from("group_items").select("group_id, entity_type, entity_id"),
  ]);

  // Aplanar cuotas de tarjeta con la moneda/descripción de su compra
  const cardRows = (cardInsts ?? []).map((i) => {
    const cp = i.card_purchases as unknown as { description: string | null; currency: string | null } | null;
    return {
      amount: i.amount,
      year: i.year,
      month: i.month,
      purchase_id: i.purchase_id,
      description: cp?.description ?? "Tarjeta",
      currency: cp?.currency ?? "ARS",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Análisis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mes a mes: ingresos, gastos y de dónde viene cada uno
        </p>
      </div>
      <AnalisisView
        services={services ?? []}
        records={records ?? []}
        cardRows={cardRows}
        annual={annual ?? []}
        income={income ?? []}
        rates={rates ?? []}
        groups={groups ?? []}
        groupItems={groupItems ?? []}
      />
    </div>
  );
}
