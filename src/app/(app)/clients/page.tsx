import { redirect } from "next/navigation";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSaPhoneForDisplay } from "@/lib/phone";
import type { BankAccountType } from "@/lib/database.types";

import { ClientDialog } from "./client-dialog";
import { DeleteClientButton } from "./delete-client-button";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm">{rows.length} on record</p>
        </div>
        <ClientDialog />
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Cell number</TableHead>
              <TableHead>ID number</TableHead>
              <TableHead>Banking</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">{client.full_name}</TableCell>
                <TableCell>{formatSaPhoneForDisplay(client.cell_number)}</TableCell>
                <TableCell>{client.id_number ?? "—"}</TableCell>
                <TableCell>
                  {client.banking ? (
                    <Badge variant="secondary">
                      {client.banking.bank_name} •••• {client.banking.account_number_last4}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">None on file</span>
                  )}
                </TableCell>
                <TableCell className="flex items-center justify-end gap-1">
                  <ClientDialog client={client} />
                  <DeleteClientButton clientId={client.id} label={client.full_name} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-8">
                  No clients yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
