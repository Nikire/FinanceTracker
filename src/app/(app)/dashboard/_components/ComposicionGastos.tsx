"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils/format";

export function ComposicionGastos({ mensual, anual }: { mensual: number; anual: number }) {
  const data = [
    { name: "Servicios mensuales", value: mensual, color: "#6366f1" },
    { name: "Gastos anuales (próx. 30d)", value: anual, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sin gastos para mostrar.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} stroke="var(--background)" />
          ))}
        </Pie>
        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
