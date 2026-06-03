"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { formatCurrency } from "@/lib/utils/format";

export interface GastoServicio {
  name: string;
  ars: number;
  color: string;
}

export function GastosPorServicio({ data }: { data: GastoServicio[] }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No hay servicios activos este mes.</p>;
  }
  const height = Math.max(160, data.length * 38 + 20);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 12 }}
          className="fill-muted-foreground"
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="rounded-lg border bg-background p-2 text-sm shadow-md">
                <p className="font-medium">{payload[0].payload.name}</p>
                <p className="font-mono">{formatCurrency(payload[0].value as number)}</p>
              </div>
            ) : null
          }
        />
        <Bar dataKey="ars" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
