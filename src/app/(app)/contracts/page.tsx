import { redirect } from "next/navigation";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";

import { ContractPanel } from "./contract-panel";
import { ContractsTable } from "./contracts-table";
import type { ContractRow, SelectableClient, SelectableVehicle } from "./types";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContractsPage({ searchParams }: PageProps<"/contracts">) {
  const params = await searchParams;
  const initialEndingSoon = firstParam(params.ending) === "soon";

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

  const rows: ContractRow[] = (contracts ?? []).map((c) => {
    const vehicle = vehicleById.get(c.vehicle_id);
    return {
      ...c,
      vehicleLabel: vehicle ? vehicleLabel(vehicle) : "Unknown vehicle",
      clientName: clientById.get(c.client_id) ?? "Unknown client",
      str_deal_details: strByContract.get(c.id) ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
        <ContractPanel vehicles={selectableVehicles} clients={selectableClients} />
      </div>

      <ContractsTable
        rows={rows}
        vehicles={selectableVehicles}
        clients={selectableClients}
        initialEndingSoon={initialEndingSoon}
      />
    </div>
  );
}
