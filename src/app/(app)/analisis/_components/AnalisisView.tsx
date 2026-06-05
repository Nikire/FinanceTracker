"use client";

import { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LineChart, Line,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Tables } from "@/lib/supabase/database.types";
import { rateFor, effectiveActive, effectiveAmount, toARS, type RateRow } from "@/lib/finance/calc";
import { formatCurrency } from "@/lib/utils/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Service = Tables<"services">;
type Record_ = Tables<"service_monthly_records">;
type Annual = Tables<"annual_expenses">;
type Income = Tables<"income">;
type Group = { id: string; name: string; color: string | null };
type GroupItem = { group_id: string; entity_type: string; entity_id: string };
type CardRow = { amount: number; year: number; month: number; purchase_id: string; description: string; currency: string };

interface Props {
  services: Service[];
  records: Record_[];
  cardRows: CardRow[];
  annual: Annual[];
  income: Income[];
  rates: RateRow[];
  groups: Group[];
  groupItems: GroupItem[];
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const TYPE_COLOR: Record<string, string> = {
  "Servicio": "#6366f1",
  "Tarjeta": "#64748b",
  "Gasto anual": "#f59e0b",
};
const SIN_GRUPO = { name: "Sin grupo", color: "#cbd5e1" };

export function AnalisisView(props: Props) {
  const { services, records, cardRows, annual, income, rates, groups, groupItems } = props;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Mapa de grupo (primer grupo) por entidad
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const groupOf = useMemo(() => {
    const m = new Map<string, Group>();
    for (const it of groupItems) {
      const key = `${it.entity_type}:${it.entity_id}`;
      if (!m.has(key)) {
        const g = groupById.get(it.group_id);
        if (g) m.set(key, g);
      }
    }
    return (type: string, id: string) => m.get(`${type}:${id}`) ?? SIN_GRUPO;
  }, [groupItems, groupById]);

  function monthData(y: number, mth: number) {
    const rateS = rateFor(rates, "service", y, mth);
    const rateI = rateFor(rates, "income", y, mth);

    const gastos: { concepto: string; tipo: string; ars: number; group: { name: string; color: string | null } }[] = [];
    for (const s of services) {
      if (!effectiveActive(s, records, y, mth)) continue;
      const { amount, currency } = effectiveAmount(s, records, y, mth);
      gastos.push({ concepto: s.name, tipo: "Servicio", ars: toARS(amount, currency, rateS), group: groupOf("service", s.id) });
    }
    for (const c of cardRows) {
      if (c.year !== y || c.month !== mth) continue;
      gastos.push({ concepto: c.description, tipo: "Tarjeta", ars: toARS(c.amount, c.currency, rateS), group: groupOf("card_purchase", c.purchase_id) });
    }
    for (const e of annual) {
      const [yy, mm] = e.due_date.split("-").map(Number);
      if (yy !== y || mm !== mth) continue;
      gastos.push({ concepto: e.name, tipo: "Gasto anual", ars: toARS(e.amount, e.currency, rateS), group: groupOf("annual_expense", e.id) });
    }
    const ingresos = income
      .filter((i) => i.year === y && i.month === mth)
      .map((i) => ({ concepto: i.description, ars: toARS(i.amount, i.currency, rateI), group: groupOf("income", i.id) }));

    const totalG = gastos.reduce((s, x) => s + x.ars, 0);
    const totalI = ingresos.reduce((s, x) => s + x.ars, 0);
    return { gastos, ingresos, totalG, totalI };
  }

  const data = useMemo(() => monthData(year, month), [year, month, props]); // eslint-disable-line react-hooks/exhaustive-deps

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of data.gastos) m.set(g.tipo, (m.get(g.tipo) ?? 0) + g.ars);
    return [...m.entries()].map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  }, [data]);

  const byGroup = useMemo(() => {
    const m = new Map<string, { value: number; color: string }>();
    for (const g of data.gastos) {
      const cur = m.get(g.group.name) ?? { value: 0, color: g.group.color ?? SIN_GRUPO.color! };
      cur.value += g.ars;
      m.set(g.group.name, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, value: Math.round(v.value), color: v.color })).sort((a, b) => b.value - a.value);
  }, [data]);

  const ingresosByGroup = useMemo(() => {
    const m = new Map<string, { value: number; color: string }>();
    for (const i of data.ingresos) {
      const cur = m.get(i.group.name) ?? { value: 0, color: i.group.color ?? SIN_GRUPO.color! };
      cur.value += i.ars;
      m.set(i.group.name, cur);
    }
    return [...m.entries()].map(([name, v]) => ({ name, value: Math.round(v.value), color: v.color }));
  }, [data]);

  const trend = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const f = new Date(year, month - 1 - (11 - i), 1);
      const d = monthData(f.getFullYear(), f.getMonth() + 1);
      return { mes: MESES_CORTO[f.getMonth()], ingresos: Math.round(d.totalI), gastos: Math.round(d.totalG) };
    });
  }, [year, month, props]); // eslint-disable-line react-hooks/exhaustive-deps

  const gastosSorted = [...data.gastos].sort((a, b) => b.ars - a.ars);
  const ingresosSorted = [...data.ingresos].sort((a, b) => b.ars - a.ars);
  const balance = data.totalI - data.totalG;

  function prev() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function next() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const money = (n: number) => formatCurrency(Math.round(n));

  return (
    <div className="space-y-5">
      {/* Navegador de mes */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-40 text-center font-medium">{MESES[month - 1]} {year}</span>
        <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ingresos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">{money(data.totalI)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gastos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-rose-600">{money(data.totalG)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Balance</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(balance)}</p></CardContent>
        </Card>
      </div>

      {/* Gastos por tipo + por origen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Gastos por tipo</CardTitle></CardHeader>
          <CardContent>
            {byType.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {byType.map((d) => <Cell key={d.name} fill={TYPE_COLOR[d.name] ?? "#94a3b8"} stroke="var(--background)" />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Gastos por origen (grupo)</CardTitle></CardHeader>
          <CardContent>
            {byGroup.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={Math.max(180, byGroup.length * 38 + 20)}>
                <BarChart data={byGroup} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(v) => money(Number(v))} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {byGroup.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detalle de gastos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalle de gastos · {MESES[month - 1]} {year}</CardTitle></CardHeader>
        <CardContent>
          {gastosSorted.length === 0 ? <Empty /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Monto (ARS)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastosSorted.map((g, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{g.concepto}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: TYPE_COLOR[g.tipo], color: TYPE_COLOR[g.tipo] }}>{g.tipo}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.group.color ?? SIN_GRUPO.color! }} />
                        {g.group.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(g.ars)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ingresos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Ingresos · {MESES[month - 1]} {year}</CardTitle></CardHeader>
        <CardContent>
          {ingresosSorted.length === 0 ? <Empty text="Sin ingresos este mes" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Monto (ARS)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingresosSorted.map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{i.concepto}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: i.group.color ?? SIN_GRUPO.color! }} />
                        {i.group.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(i.ars)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {ingresosByGroup.length > 1 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Por origen: {ingresosByGroup.map((g) => `${g.name} ${money(g.value)}`).join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tendencia 12 meses */}
      <Card>
        <CardHeader><CardTitle className="text-base">Últimos 12 meses</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend} margin={{ top: 4, right: 12, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Legend formatter={(v) => (v === "ingresos" ? "Ingresos" : "Gastos")} />
              <Line type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="gastos" stroke="#f43f5e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Empty({ text = "Sin datos este mes" }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
