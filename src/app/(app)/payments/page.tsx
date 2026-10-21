import { redirect } from "next/navigation";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";

import { PaymentsViewSwitcher } from "./view-switcher";
import type {
  ContractMonthlyReportRow,
  ContractPaymentSummaryRow,
  MonthlyCollectedDatum,
  MonthlyReportCell,
} from "./types";

const MONTHS_SHOWN = 12;
const MONTH_LABEL = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric" });

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

/** Steps a "YYYY-MM" key back by `n` months. */
function monthKeyMinus(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: transactions }, { data: contracts }, { data: clients }, { data: registrations }] =
    await Promise.all([
      supabase
        .from("payment_transactions")
        .select("contract_id, transaction_date, type, cash_effect")
        .order("transaction_date", { ascending: true }),
      supabase.from("contracts").select("id, deal_number, client_id, vehicle_id, payment_method"),
      supabase.from("clients").select("id, full_name"),
      supabase.from("vehicle_registrations").select("vehicle_id, plate_number").is("effective_to", null),
    ]);

  const dealNumberByContract = new Map((contracts ?? []).map((c) => [c.id, c.deal_number]));
  const clientIdByContract = new Map((contracts ?? []).map((c) => [c.id, c.client_id]));
  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));
  const vehicleIdByContract = new Map((contracts ?? []).map((c) => [c.id, c.vehicle_id]));
  const paymentMethodByContract = new Map((contracts ?? []).map((c) => [c.id, c.payment_method]));
  const plateByVehicle = new Map((registrations ?? []).map((r) => [r.vehicle_id, r.plate_number]));

  // Per-contract rollup — rows are already ordered oldest-first, so the
  // last write for a given contract is always its most recent transaction.
  const byContract = new Map<
    string,
    { netCollected: number; reversalCount: number; transactionCount: number; lastDate: string; lastType: "receipt" | "debit_note" }
  >();
  const monthlyTotals = new Map<string, number>();
  // Per-contract, per-month net — feeds the report table.
  const monthlyByContract = new Map<string, Map<string, number>>();
  const firstMonthByContract = new Map<string, string>();

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

    if (!monthlyByContract.has(t.contract_id)) monthlyByContract.set(t.contract_id, new Map());
    const contractMonths = monthlyByContract.get(t.contract_id)!;
    contractMonths.set(key, (contractMonths.get(key) ?? 0) + t.cash_effect);

    if (!firstMonthByContract.has(t.contract_id) || key < firstMonthByContract.get(t.contract_id)!) {
      firstMonthByContract.set(t.contract_id, key);
    }
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

  // Report window — anchored to the most recent month actually present in
  // the data (not the real calendar "today"), the same choice the chart
  // above makes: this is historical/imported data, and today's calendar
  // date usually runs ahead of it, which would otherwise show every
  // account "missing" trailing months that just haven't happened yet.
  const windowEndKey = lastMonthKey ?? monthKey(new Date().toISOString());
  const windowKeys = Array.from({ length: MONTHS_SHOWN }, (_, i) =>
    monthKeyMinus(windowEndKey, MONTHS_SHOWN - 1 - i)
  );

  const reportRows: ContractMonthlyReportRow[] = [...byContract.keys()].map((contractId) => {
    const contractMonths = monthlyByContract.get(contractId) ?? new Map();
    const firstMonth = firstMonthByContract.get(contractId) ?? windowKeys[0];
    let missedCount = 0;
    const months: MonthlyReportCell[] = windowKeys.map((key) => {
      const beforeCoverage = key < firstMonth;
      const net = contractMonths.get(key) ?? 0;
      const missed = !beforeCoverage && net <= 0;
      if (missed) missedCount += 1;
      return { monthKey: key, netCollected: net, beforeCoverage, missed };
    });
    return {
      contractId,
      dealNumber: dealNumberByContract.get(contractId) ?? null,
      clientName: clientNameById.get(clientIdByContract.get(contractId) ?? "") ?? "Unknown client",
      reg: plateByVehicle.get(vehicleIdByContract.get(contractId) ?? "") ?? null,
      paymentMethod: paymentMethodByContract.get(contractId) ?? "other",
      months,
      missedCount,
    };
  });

  const monthLabels = windowKeys.map((key) => MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground text-sm">
          Debit-order payment history, backfilled from the legacy system&apos;s ledger.
        </p>
      </div>

      <PaymentsViewSwitcher
        reportRows={reportRows}
        monthLabels={monthLabels}
        summaryRows={summaryRows}
        monthlyData={monthlyData}
        netCollected={netCollected}
        lastMonthLabel={lastMonthLabel}
        lastMonthNetCollected={lastMonthNetCollected}
        contractsInArrears={contractsInArrears}
        contractsTracked={summaryRows.length}
        exportedBy={profile.fullName}
      />
    </div>
  );
}
