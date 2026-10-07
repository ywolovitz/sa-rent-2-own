import { createClient } from "@/lib/supabase/server";
import type { VehicleStatus } from "@/lib/database.types";

import { FleetStatusPieChartClient } from "./fleet-status-pie-chart-client";

const STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  on_road: "On road",
  parked: "Parked",
  in_repair: "In repair",
  for_sale: "For sale",
  sold: "Sold",
  written_off: "Written off",
};

// Distinct swatches from the brand palette so every slice reads apart
// at a glance (the Status badge reuses grey for two statuses, which is
// fine with an inline label but not for a legend-only chart).
const STATUS_COLORS: Record<VehicleStatus, string> = {
  available: "var(--brand-grey)",
  on_road: "var(--color-success)",
  parked: "var(--brand-grey-light)",
  in_repair: "var(--color-warning)",
  for_sale: "var(--brand-blue)",
  sold: "var(--brand-blue-dark)",
  written_off: "var(--color-destructive)",
};

/** Self-contained like FleetStatsCards — RLS already scopes the
 * vehicles a technician sees to their own assignments, so this reflects
 * whichever subset the signed-in user is allowed to read. */
export async function FleetStatusPieChart() {
  const supabase = await createClient();
  const { data: vehicles } = await supabase.from("vehicles").select("status");

  const counts: Record<VehicleStatus, number> = {
    available: 0,
    on_road: 0,
    parked: 0,
    in_repair: 0,
    for_sale: 0,
    sold: 0,
    written_off: 0,
  };
  for (const v of vehicles ?? []) {
    counts[v.status] += 1;
  }

  const data = (Object.keys(counts) as VehicleStatus[])
    .filter((status) => counts[status] > 0)
    .map((status) => ({
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
