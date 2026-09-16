import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";

import { VehiclePanel } from "./vehicle-panel";
import { VehiclesTable } from "./vehicles-table";
import type { VehicleWithRegistration } from "./types";

export default async function VehiclesPage() {
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createClient()]);
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select(
      "id, file_no, make, model, year, colour, vin, engine_number, status, current_mileage, next_service_km, next_service_date, last_serviced_by, tracker_supplier, tracker_running, natis_on_file, license_disc_expiry, has_spare_key, warranty_active, warranty_notes, has_contract_file"
    )
    .order("file_no");

  const vehicleIds = (vehicles ?? []).map((v) => v.id);

  const [{ data: registrations }, { data: activeContracts }] = await Promise.all([
    vehicleIds.length
      ? supabase
          .from("vehicle_registrations")
          .select("vehicle_id, plate_number")
          .in("vehicle_id", vehicleIds)
          .is("effective_to", null)
      : Promise.resolve({ data: [] as { vehicle_id: string; plate_number: string }[] }),
    canManage && vehicleIds.length
      ? supabase
          .from("contracts")
          .select("vehicle_id, client_id")
          .eq("status", "active")
          .in("vehicle_id", vehicleIds)
      : Promise.resolve({ data: [] as { vehicle_id: string; client_id: string }[] }),
  ]);

  const clientIds = (activeContracts ?? []).map((c) => c.client_id);
  const { data: clients } = clientIds.length
    ? await supabase.from("clients").select("id, full_name").in("id", clientIds)
    : { data: [] as { id: string; full_name: string }[] };

  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.full_name]));
  const plateByVehicle = new Map((registrations ?? []).map((r) => [r.vehicle_id, r.plate_number]));
  const clientByVehicle = new Map(
    (activeContracts ?? []).map((c) => [c.vehicle_id, clientNameById.get(c.client_id) ?? null])
  );

  const rows: VehicleWithRegistration[] = (vehicles ?? []).map((v) => ({
    ...v,
    current_plate: plateByVehicle.get(v.id) ?? null,
    current_client_name: clientByVehicle.get(v.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
        {canManage && <VehiclePanel />}
      </div>

      <VehiclesTable rows={rows} canManage={canManage} />
    </div>
  );
}
