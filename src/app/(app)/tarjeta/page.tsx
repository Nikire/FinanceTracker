import { createClient } from "@/lib/supabase/server";
import { rateFor } from "@/lib/finance/calc";
import { TarjetaManager } from "./_components/TarjetaManager";

export const dynamic = "force-dynamic";

export type Cuota = {
  id: string;
  number: number;
  amount: number;
  year: number;
  month: number;
  is_paid: boolean;
};

export type CardPurchaseView = {
  id: string;
  description: string;
  purchase_date: string;
  currency: string;
  total_amount: number;
  installments: number;
  card: string | null;
  cuotas: Cuota[];
};

export default async function TarjetaPage() {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: purchases }, { data: groups }, { data: groupItems }, { data: rates }] = await Promise.all([
    supabase
      .from("card_purchases")
      .select("*, card_installments(id, number, amount, year, month, is_paid)")
      .order("purchase_date", { ascending: false }),
    supabase.from("groups").select("id, name, color").order("name"),
    supabase.from("group_items").select("group_id, entity_id").eq("entity_type", "card_purchase"),
    supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
  ]);

  const rate = rateFor(rates ?? [], "service", now.getFullYear(), now.getMonth() + 1);
  const memberMap: Record<string, string[]> = {};
  for (const it of groupItems ?? []) (memberMap[it.entity_id] ??= []).push(it.group_id);

  const list: CardPurchaseView[] = (purchases ?? []).map((p) => ({
    id: p.id,
    description: p.description,
    purchase_date: p.purchase_date,
    currency: p.currency,
    total_amount: p.total_amount,
    installments: p.installments,
    card: p.card,
    cuotas: (p.card_installments ?? []).slice().sort((a, b) => a.number - b.number),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Uso de tarjeta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consumos puntuales y compras en cuotas, con seguimiento de lo que falta pagar
        </p>
      </div>
      <TarjetaManager purchases={list} groups={groups ?? []} memberMap={memberMap} rate={rate} />
    </div>
  );
}
