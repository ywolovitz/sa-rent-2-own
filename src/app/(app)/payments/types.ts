export interface ContractPaymentSummaryRow {
  contractId: string;
  dealNumber: string | null;
  clientName: string;
  lastTransactionDate: string;
  lastStatus: "cleared" | "reversed";
  netCollected: number;
  reversalCount: number;
  transactionCount: number;
}

export interface MonthlyCollectedDatum {
  month: string; // "Jan 2026"
  netCollected: number;
}
