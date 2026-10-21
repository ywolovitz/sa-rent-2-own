import { redirect } from "next/navigation";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";

import { PaymentsStatsCards } from "./stats-cards";
import { MonthlyCollectionsChartClient } from "./monthly-collections-chart-client";
import { PaymentsTable } from "./payments-table";
import type { ContractPaymentSummaryRow, MonthlyCollectedDatum } from "./types";

const MONTHS_SHOWN = 12;
const MONTH_LABEL = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric" });

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export default async function PaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: transactions }, { data: contracts }, { data: clients }] = await Promise.all([
    supabase
      .from("payment_transactions")
      .select("contract_id, transaction_date, type, cash_effect")
      .order("transaction_date", { ascending: true }),
    supabase.from("contracts").select("id, deal_number, client_id"),
    supabase.from("clients").select("id, full_name"),
  ]);

  const dealNumberByContract = new Map((contracts ?? []).map((c) => [c.id, c.deal_number]));
  const clientIdByContract = new Map((contracts ?? []).map((c) => [c.id, c.client_id]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));

  // Per-contract rollup — rows are already ordered oldest-first, so the
  // last write for a given contract is always its most recent transaction.
  const byContract = new Map<
    string,
    { netCollected: number; reversalCount: number; transactionCount: number; lastDate: string; lastType: "receipt" | "debit_note" }
  >();
  const monthlyTotals = new Map<string, number>();

  for (const t of transactions ?? []) {
    const existing = byContract.get(t.contract_id) ?? {
      netCollected: 0,
      reversalCount: 0,
      transactionCount: 0,
      lastDate: t.transaction_date,
      lastType: t.type,
    };
    existing.netCollected += t.cash_effect;
    existing.transactionCount += 1;
    if (t.type === "debit_note") existing.reversalCount += 1;
    existing.lastDate = t.transaction_date;
    existing.lastType = t.type;
    byContract.set(t.contract_id, existing);

    const key = monthKey(t.transaction_date);
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + t.cash_effect);
  }

  const summaryRows: ContractPaymentSummaryRow[] = [...byContract.entries()].map(([contractId, agg]) => ({
    contractId,
    dealNumber: dealNumberByContract.get(contractId) ?? null,
    clientName: clientNameById.get(clientIdByContract.get(contractId) ?? "") ?? "Unknown client",
    lastTransactionDate: agg.lastDate,
    lastStatus: agg.lastType === "debit_note" ? "reversed" : "cleared",
    netCollected: agg.netCollected,
    reversalCount: agg.reversalCount,
    transactionCount: agg.transactionCount,
  }));

  const sortedMonthKeys = [...monthlyTotals.keys()].sort();
  const recentMonthKeys = sortedMonthKeys.slice(-MONTHS_SHOWN);
  const monthlyData: MonthlyCollectedDatum[] = recentMonthKeys.map((key) => ({
    month: MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`)),
    netCollected: monthlyTotals.get(key) ?? 0,
  }));

  const netCollected = [...monthlyTotals.values()].reduce((sum, v) => sum + v, 0);
  const lastMonthKey = sortedMonthKeys.at(-1) ?? null;
  const lastMonthNetCollected = lastMonthKey ? (monthlyTotals.get(lastMonthKey) ?? 0) : 0;
  const lastMonthLabel = lastMonthKey ? MONTH_LABEL.format(new Date(`${lastMonthKey}-01T00:00:00Z`)) : null;
  const contractsInArrears = summaryRows.filter((r) => r.lastStatus === "reversed").length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground text-sm">
          Debit-order payment history, backfilled from the legacy system&apos;s ledger.
        </p>
      </div>

      <PaymentsStatsCards
        netCollected={netCollected}
        lastMonthLabel={lastMonthLabel}
        lastMonthNetCollected={lastMonthNetCollected}
        contractsInArrears={contractsInArrears}
        contractsTracked={summaryRows.length}
      />

      <div className="h-64 rounded-lg border bg-background p-4">
        <h3 className="mb-3 font-semibold tracking-tight">Monthly net collected</h3>
        <div className="h-[calc(100%-2rem)]">
          <MonthlyCollectionsChartClient data={monthlyData} />
        </div>
      </div>

      <PaymentsTable rows={summaryRows} />
    </div>
  );
}
