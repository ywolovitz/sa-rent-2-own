import type { TrackerStatus, VehicleStatus } from "@/lib/database.types";

export interface VehicleWithRegistration {
  id: string;
  file_no: string;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  vin: string | null;
  engine_number: string | null;
  status: VehicleStatus;
  current_mileage: number | null;
  next_service_km: number | null;
  next_service_date: string | null;
  last_serviced_by: string | null;
  tracker_supplier: string | null;
  tracker_running: TrackerStatus;
  natis_on_file: boolean;
  license_disc_expiry: string | null;
  has_spare_key: boolean;
  warranty_active: boolean;
  warranty_notes: string | null;
  has_contract_file: boolean;
  current_plate: string | null;
  current_client_name: string | null;
}
