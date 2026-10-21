"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PaymentsStatsCards } from "./stats-cards";
import { MonthlyCollectionsChartClient } from "./monthly-collections-chart-client";
import { PaymentsTable } from "./payments-table";
import { MonthlyReportTable } from "./monthly-report-table";
import { TransactionsTable } from "./transactions-table";
import type {
  ContractMonthlyReportRow,
  ContractPaymentSummaryRow,
  MonthlyCollectedDatum,
  PaymentTransactionRow,
} from "./types";

export function PaymentsViewSwitcher({
  reportRows,
  monthLabels,
  summaryRows,
  transactionRows,
  monthlyData,
  netCollected,
  lastMonthLabel,
  lastMonthNetCollected,
  contractsInArrears,
  contractsTracked,
  exportedBy,
}: {
  reportRows: ContractMonthlyReportRow[];
  monthLabels: string[];
  summaryRows: ContractPaymentSummaryRow[];
  transactionRows: PaymentTransactionRow[];
  monthlyData: MonthlyCollectedDatum[];
  netCollected: number;
  lastMonthLabel: string | null;
  lastMonthNetCollected: number;
  contractsInArrears: number;
  contractsTracked: number;
  exportedBy: string;
}) {
  return (
    <Tabs defaultValue="report" className="flex min-h-0 flex-1 flex-col gap-4">
      <TabsList>
        <TabsTrigger value="report">Report</TabsTrigger>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
      </TabsList>

      <TabsContent value="report" className="flex min-h-0 flex-1 flex-col">
        <MonthlyReportTable rows={reportRows} monthLabels={monthLabels} exportedBy={exportedBy} />
      </TabsContent>

      <TabsContent value="dashboard" className="flex min-h-0 flex-1 flex-col gap-4">
        <PaymentsStatsCards
          netCollected={netCollected}
          lastMonthLabel={lastMonthLabel}
          lastMonthNetCollected={lastMonthNetCollected}
          contractsInArrears={contractsInArrears}
          contractsTracked={contractsTracked}
        />

        <div className="h-64 rounded-lg border bg-background p-4">
          <h3 className="mb-3 font-semibold tracking-tight">Monthly net collected</h3>
          <div className="h-[calc(100%-2rem)]">
            <MonthlyCollectionsChartClient data={monthlyData} />
          </div>
        </div>

        <PaymentsTable rows={summaryRows} />
      </TabsContent>

      <TabsContent value="transactions" className="flex min-h-0 flex-1 flex-col">
        <TransactionsTable rows={transactionRows} exportedBy={exportedBy} />
      </TabsContent>
    </Tabs>
  );
}
