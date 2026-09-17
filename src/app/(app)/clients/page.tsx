import { redirect } from "next/navigation";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import type { BankAccountType } from "@/lib/database.types";

import { ClientPanel } from "./client-panel";
import { ClientsTable } from "./clients-table";
import type { ClientWithBanking } from "./types";

export default async function ClientsPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, id_number, cell_number, alt_cell_number, email, address, notes")
    .order("full_name");

  const clientIds = (clients ?? []).map((c) => c.id);
  interface BankingRow {
    id: string;
    client_id: string;
    bank_name: string;
    account_type: BankAccountType;
    branch_code: string | null;
    account_number_last4: string;
  }
  const { data: banking } = clientIds.length
    ? await supabase
        .from("client_banking_details")
        .select("id, client_id, bank_name, account_type, branch_code, account_number_last4")
        .in("client_id", clientIds)
    : { data: [] as BankingRow[] };

  const bankingByClient = new Map((banking ?? []).map((b) => [b.client_id, b]));

  const rows: ClientWithBanking[] = (clients ?? []).map((c) => {
    const b = bankingByClient.get(c.id);
    return {
      ...c,
      banking: b
        ? {
            id: b.id,
            bank_name: b.bank_name,
            account_type: b.account_type,
            branch_code: b.branch_code,
            account_number_last4: b.account_number_last4,
          }
        : null,
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <ClientPanel />
      </div>

      <ClientsTable rows={rows} />
    </div>
  );
}
