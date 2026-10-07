"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface DeadlineWeekDatum {
  week: string;
  service: number;
  contractEnding: number;
  licenseExpiring: number;
}

const SERIES = [
  { key: "service", label: "Due for service", color: "var(--brand-blue-dark)" },
  { key: "contractEnding", label: "Contract ending", color: "var(--color-success)" },
  { key: "licenseExpiring", label: "License expiring", color: "var(--color-destructive)" },
] as const;

export function FleetDeadlinesChartClient({ data }: { data: DeadlineWeekDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barGap={2} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={28} />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" />
        {SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={20}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
