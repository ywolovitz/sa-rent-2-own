import { createClient } from "@/lib/supabase/server";
import type { VehicleStatus } from "@/lib/database.types";
import { FLEET_STATUSES, VEHICLE_STATUS_LABELS as STATUS_LABELS, isFleetStatus } from "@/lib/vehicle-status";

import { FleetStatusPieChartClient } from "./fleet-status-pie-chart-client";

// Distinct swatches from the brand palette so every slice reads apart
// at a glance (the Status badge reuses grey for several statuses, which is
// fine with an inline label but not for a legend-only chart). Only fleet
// statuses are charted — vehicles that have left the fleet aren't.
const STATUS_COLORS: Record<(typeof FLEET_STATUSES)[number], string> = {
  on_road: "var(--color-success)",
  parked: "var(--brand-grey-light)",
  in_repair: "var(--color-warning)",
  for_sale: "var(--brand-blue)",
  str: "var(--brand-blue-dark)",
  rental: "var(--brand-grey)",
  courtesy: "var(--color-destructive)",
};

/** Self-contained like FleetStatsCards — RLS already scopes the
 * vehicles a technician sees to their own assignments, so this reflects
 * whichever subset the signed-in user is allowed to read. */
export async function FleetStatusPieChart() {
  const supabase = await createClient();
  const { data: vehicles } = await supabase.from("vehicles").select("status");

  const counts = Object.fromEntries(FLEET_STATUSES.map((status) => [status, 0])) as Record<
    (typeof FLEET_STATUSES)[number],
    number
  >;
  for (const v of vehicles ?? []) {
    const status: VehicleStatus = v.status;
    if (isFleetStatus(status)) counts[status as (typeof FLEET_STATUSES)[number]] += 1;
  }

  const data = FLEET_STATUSES.filter((status) => counts[status] > 0).map((status) => ({
    name: STATUS_LABELS[status],
    value: counts[status],
    color: STATUS_COLORS[status],
  }));

  return (
    <div className="flex flex-1 flex-col rounded-lg border bg-background p-4">
      <div className="mb-3">
        <h3 className="font-semibold tracking-tight">Fleet by status</h3>
        <p className="text-muted-foreground text-sm">Vehicles per status</p>
      </div>
      <div className="h-36">
        <FleetStatusPieChartClient data={data} />
      </div>
    </div>
  );
}
