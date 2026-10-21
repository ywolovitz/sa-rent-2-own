"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthlyCollectedDatum } from "./types";

function formatRand(value: number): string {
  return `R${value.toLocaleString()}`;
}

export function MonthlyCollectionsChartClient({ data }: { data: MonthlyCollectedDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
        <YAxis tickFormatter={formatRand} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={70} />
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
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="netCollected"
          name="Net collected"
          fill="var(--brand-blue-dark)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
        <Bar dataKey="reversed" name="Reversed" fill="var(--brand-red)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
