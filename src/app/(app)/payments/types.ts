export interface ContractPaymentSummaryRow {
  contractId: string;
  dealNumber: string | null;
  clientName: string;
  lastTransactionDate: string;
  lastStatus: "cleared" | "reversed";
  netCollected: number;
  reversalCount: number;
  transactionCount: number;
  outstandingBalance: number | null;
}

export interface MonthlyCollectedDatum {
  month: string; // "Jan 2026"
  netCollected: number;
  reversed: number;
}

export interface MonthlyReportCell {
  monthKey: string; // "2026-04"
  netCollected: number;
  /** No transaction history at all for this contract this early — shown
   * as a neutral cell, not counted as a miss (the contract may not have
   * started, or wasn't matched into the ledger yet at that point). */
  beforeCoverage: boolean;
  /** Has coverage, but netCollected <= 0 — a payment was due and didn't
   * clear by month end. */
  missed: boolean;
}

export interface ContractMonthlyReportRow {
  contractId: string;
  dealNumber: string | null;
  clientName: string;
  reg: string | null;
  paymentMethod: string;
  months: MonthlyReportCell[];
  missedCount: number;
}
