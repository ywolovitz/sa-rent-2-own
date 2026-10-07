"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface FleetValueDatum {
  name: string;
  value: number;
  color: string;
}

function formatRand(value: number): string {
  return `R${value.toLocaleString()}`;
}

export function FleetValueChartClient({ data }: { data: FleetValueDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tickFormatter={formatRand} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
        <Tooltip
          formatter={(value) => formatRand(Number(value))}
          contentStyle={{
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
