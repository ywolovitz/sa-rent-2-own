"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { PaymentTransactionType } from "@/lib/database.types";

export interface ContractPaymentHistoryEntry {
  id: string;
  transaction_date: string;
  type: PaymentTransactionType;
  reference: string;
  invoice_reference: string;
  amount: number;
  cash_effect: number;
  reversed: boolean;
}

export async function listContractPaymentHistory(
  contractId: string
): Promise<{ data?: ContractPaymentHistoryEntry[]; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("id, transaction_date, type, reference, invoice_reference, amount, cash_effect, reversed_transaction_id")
    .eq("contract_id", contractId)
    .order("transaction_date", { ascending: false });

  if (error) return { error: "Couldn't load payment history" };

  const rows: ContractPaymentHistoryEntry[] = (data ?? []).map((t) => ({
    id: t.id,
    transaction_date: t.transaction_date,
    type: t.type,
    reference: t.reference,
    invoice_reference: t.invoice_reference,
    amount: t.amount,
    cash_effect: t.cash_effect,
    reversed: t.reversed_transaction_id !== null,
  }));

  return { data: rows };
}
