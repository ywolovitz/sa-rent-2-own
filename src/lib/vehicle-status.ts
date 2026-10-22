import type { VehicleStatus } from "@/lib/database.types";

/**
 * Vehicle statuses, split in two. The working fleet (Vehicles → Fleet tab,
 * dashboard counts, service/licence deadlines) is every status in
 * FLEET_STATUSES; a vehicle in any END_OF_CONTRACT_STATUSES status leaves
 * the fleet and shows on the "End of Contract" tab instead.
 *
 * (The Postgres enum still contains a retired `available` value — enum
 * values can't be dropped cleanly — but no vehicle uses it and the app
 * never offers it.)
 */
export const FLEET_STATUSES = [
  "on_road",
  "parked",
  "in_repair",
  "for_sale",
  "str",
  "rental",
  "courtesy",
] as const satisfies readonly VehicleStatus[];

export const END_OF_CONTRACT_STATUSES = ["sold", "written_off", "end_of_deal"] as const satisfies readonly VehicleStatus[];

export function isFleetStatus(status: VehicleStatus): boolean {
  return (FLEET_STATUSES as readonly VehicleStatus[]).includes(status);
}

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  on_road: "On Road",
  parked: "Parked",
  in_repair: "In Repair",
  for_sale: "For Sale",
  str: "STR",
  rental: "Rental",
  courtesy: "Courtesy",
  sold: "Sold",
  written_off: "Written Off",
  end_of_deal: "End of Deal",
};

export const VEHICLE_STATUS_VARIANT: Record<
  VehicleStatus,
  "default" | "secondary" | "destructive" | "warning" | "success" | "outline"
> = {
  on_road: "success",
  parked: "outline",
  in_repair: "warning",
  for_sale: "default",
  str: "secondary",
  rental: "secondary",
  courtesy: "secondary",
  sold: "secondary",
  written_off: "destructive",
  end_of_deal: "outline",
};

/** Excel export chip colours (ARGB). */
export const VEHICLE_STATUS_CHIP_COLORS: Record<VehicleStatus, { fill: string; font?: string }> = {
  on_road: { fill: "FF2F9E58" },
  parked: { fill: "FFFFFFFF", font: "FF1F1F1F" },
  in_repair: { fill: "FFF0A830" },
  for_sale: { fill: "FF1F1F1F" },
  str: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  rental: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  courtesy: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  sold: { fill: "FFE5E5E5", font: "FF1F1F1F" },
  written_off: { fill: "FFFF5252" },
  end_of_deal: { fill: "FFFFFFFF", font: "FF1F1F1F" },
};
