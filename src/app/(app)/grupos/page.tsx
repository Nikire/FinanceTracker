import { createClient } from "@/lib/supabase/server";
import { rateFor, toARS } from "@/lib/finance/calc";
import { GruposManager } from "./_components/GruposManager";

export const dynamic = "force-dynamic";

export type GroupMember = {
  entity_type: "service" | "annual_expense" | "income";
  entity_id: string;
  label: string;
  amount: number;
  currency: string;
  amount_ars: number;
};

export type GroupView = {
  id: string;
  name: string;
  color: string | null;
  members: GroupMember[];
  gastos_ars: number;
  ingresos_ars: number;
};

export type EntityOption = { id: string; label: string };

export default async function GruposPage() {
  const supabase = await createClient();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const [
    { data: groups },
    { data: items },
    { data: services },
    { data: annual },
    { data: income },
    { data: rates },
  ] = await Promise.all([
    supabase.from("groups").select("*").order("name"),
    supabase.from("group_items").select("group_id, entity_type, entity_id"),
    supabase.from("services").select("id, name, amount, currency"),
    supabase.from("annual_expenses").select("id, name, amount, currency"),
    supabase.from("income").select("id, description, amount, currency"),
    supabase.from("exchange_rates").select("usd_to_ars, kind, year, month"),
  ]);

  const rateService = rateFor(rates ?? [], "service", y, m);
  const rateIncome = rateFor(rates ?? [], "income", y, m);

  type Cat = { id: string; label: string; amount: number; currency: string };
  const svc = new Map<string, Cat>((services ?? []).map((s) => [s.id, { id: s.id, label: s.name, amount: s.amount, currency: s.currency }]));
  const exp = new Map<string, Cat>((annual ?? []).map((e) => [e.id, { id: e.id, label: e.name, amount: e.amount, currency: e.currency }]));
  const inc = new Map<string, Cat>((income ?? []).map((i) => [i.id, { id: i.id, label: i.description, amount: i.amount, currency: i.currency }]));

  const catFor = (t: GroupMember["entity_type"]) => (t === "service" ? svc : t === "annual_expense" ? exp : inc);

  const groupViews: GroupView[] = (groups ?? []).map((g) => {
    const members: GroupMember[] = (items ?? [])
      .filter((it) => it.group_id === g.id)
      .map((it) => {
        const c = catFor(it.entity_type).get(it.entity_id);
        const rate = it.entity_type === "income" ? rateIncome : rateService;
        return {
          entity_type: it.entity_type,
          entity_id: it.entity_id,
          label: c?.label ?? "(eliminado)",
          amount: c?.amount ?? 0,
          currency: c?.currency ?? "ARS",
          amount_ars: c ? toARS(c.amount, c.currency, rate) : 0,
        };
      });
    const gastos_ars = members
      .filter((x) => x.entity_type !== "income")
      .reduce((s, x) => s + x.amount_ars, 0);
    const ingresos_ars = members
      .filter((x) => x.entity_type === "income")
      .reduce((s, x) => s + x.amount_ars, 0);
    return { id: g.id, name: g.name, color: g.color, members, gastos_ars, ingresos_ars };
  });

  const catalogs = {
    service: [...svc.values()].map((c) => ({ id: c.id, label: c.label })) as EntityOption[],
    annual_expense: [...exp.values()].map((c) => ({ id: c.id, label: c.label })) as EntityOption[],
    income: [...inc.values()].map((c) => ({ id: c.id, label: c.label })) as EntityOption[],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Grupos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agrupá servicios, gastos anuales e ingresos por origen
        </p>
      </div>
      <GruposManager groups={groupViews} catalogs={catalogs} />
    </div>
  );
}
