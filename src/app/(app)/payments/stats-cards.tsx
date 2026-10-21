function formatRand(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(
    amount
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-lg border bg-background p-4">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{subtitle}</span>
    </div>
  );
}

export function PaymentsStatsCards({
  netCollected,
  lastMonthLabel,
  lastMonthNetCollected,
  contractsInArrears,
  contractsTracked,
}: {
  netCollected: number;
  lastMonthLabel: string | null;
  lastMonthNetCollected: number;
  contractsInArrears: number;
  contractsTracked: number;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <StatCard label="Net collected" value={formatRand(netCollected)} subtitle="All imported history" />
      <StatCard
        label={lastMonthLabel ?? "Last month"}
        value={formatRand(lastMonthNetCollected)}
        subtitle="Most recent month on file"
      />
      <StatCard
        label="In arrears"
        value={String(contractsInArrears)}
        subtitle="Last attempt bounced, not yet re-collected"
      />
      <StatCard
        label="Contracts tracked"
        value={String(contractsTracked)}
        subtitle="Have a deal number matched to payment history"
      />
    </div>
  );
}
