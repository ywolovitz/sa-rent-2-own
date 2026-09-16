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
import type { ContractStatus } from "@/lib/database.types";

import { ContractPanel } from "./contract-panel";
import { DeleteContractButton } from "./delete-contract-button";
import type { ContractWithDetails, SelectableClient, SelectableVehicle } from "./types";

const STATUS_VARIANT: Record<
  ContractStatus,
  "default" | "secondary" | "destructive" | "warning" | "success" | "outline"
> = {
  active: "success",
  completed: "secondary",
  cancelled: "outline",
  defaulted: "destructive",
  repossessed: "destructive",
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  defaulted: "Defaulted",
  repossessed: "Repossessed",
};

export default async function ContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: contracts }, { data: vehicles }, { data: clients }, { data: registrations }, { data: strDetails }] =
    await Promise.all([
      supabase
        .from("contracts")
        .select(
          "id, vehicle_id, client_id, contract_type, status, start_date, end_date, payment_method, installment_amount, purchase_price, potential_sale_price, sale_price, residual_value, total_collected, outstanding_balance, arrears_amount, is_paid_up, notes"
        )
        .order("start_date", { ascending: false }),
      supabase.from("vehicles").select("id, file_no, make, model, year"),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("vehicle_registrations").select("vehicle_id, plate_number").is("effective_to", null),
      supabase.from("str_deal_details").select("contract_id, billing_day, billing_direction, billing_frequency"),
    ]);

  const plateByVehicle = new Map((registrations ?? []).map((r) => [r.vehicle_id, r.plate_number]));
  const vehicleLabel = (v: { id: string; file_no: string; make: string | null; model: string | null; year: number | null }) =>
    [v.file_no, plateByVehicle.get(v.id), [v.year, v.make, v.model].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" · ");

  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));
  const strByContract = new Map((strDetails ?? []).map((s) => [s.contract_id, s]));

  const activeVehicleIds = new Set(
    (contracts ?? []).filter((c) => c.status === "active").map((c) => c.vehicle_id)
  );

  const selectableVehicles: SelectableVehicle[] = (vehicles ?? [])
    .filter((v) => !activeVehicleIds.has(v.id))
    .map((v) => ({ id: v.id, label: vehicleLabel(v) }));

  const selectableClients: SelectableClient[] = (clients ?? []).map((c) => ({
    id: c.id,
    label: c.full_name,
  }));

  const rows = (contracts ?? []).map((c) => {
    const vehicle = vehicleById.get(c.vehicle_id);
    return {
      ...c,
      vehicleLabel: vehicle ? vehicleLabel(vehicle) : "Unknown vehicle",
      clientName: clientById.get(c.client_id) ?? "Unknown client",
      strDealDetails: strByContract.get(c.id) ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground text-sm">{rows.length} on record</p>
        </div>
        <ContractPanel vehicles={selectableVehicles} clients={selectableClients} />
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Installment</TableHead>
              <TableHead>Arrears</TableHead>
              <TableHead>End date</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const contractDetails: ContractWithDetails = {
                id: row.id,
                vehicle_id: row.vehicle_id,
                client_id: row.client_id,
                contract_type: row.contract_type,
                status: row.status,
                start_date: row.start_date,
                end_date: row.end_date,
                payment_method: row.payment_method,
                installment_amount: row.installment_amount,
                purchase_price: row.purchase_price,
                potential_sale_price: row.potential_sale_price,
                sale_price: row.sale_price,
                residual_value: row.residual_value,
                total_collected: row.total_collected,
                outstanding_balance: row.outstanding_balance,
                arrears_amount: row.arrears_amount,
                is_paid_up: row.is_paid_up,
                notes: row.notes,
                str_deal_details: row.strDealDetails,
              };

              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.vehicleLabel}</TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell className="capitalize">{row.contract_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.installment_amount ? `R${row.installment_amount.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    {row.arrears_amount > 0 ? (
                      <Badge variant="destructive">R{row.arrears_amount.toLocaleString()}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{row.end_date ?? "—"}</TableCell>
                  <TableCell className="flex items-center justify-end gap-1">
                    <ContractPanel
                      contract={contractDetails}
                      vehicles={selectableVehicles}
                      clients={selectableClients}
                    />
                    <DeleteContractButton contractId={row.id} label={row.vehicleLabel} />
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground text-center py-8">
                  No contracts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
