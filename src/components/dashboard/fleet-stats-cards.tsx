import { createClient } from "@/lib/supabase/server";
import { isoDaysFromNow } from "@/lib/date-ranges";
import type { VehicleStatus } from "@/lib/database.types";

import { StatLinkPill } from "./stat-pill";

/** Dashboard-only summary + navigation row — links into pre-filtered
 * Vehicles/Contracts views. Vehicles and Contracts render their own local
 * equivalent of these same filters as instant buttons (see VehiclesTable /
 * ContractsTable) instead of this, since clicking a card to re-fetch the
 * page you're already on felt like a real navigation, not a filter. */
export async function FleetStatsCards() {
  const supabase = await createClient();

  const contractsEndingCutoff = isoDaysFromNow(90);

  // Independent queries — run together instead of waterfalling.
  const [{ data: vehicles }, { count: endingSoonCount }] = await Promise.all([
    supabase.from("vehicles").select("status, next_service_date"),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lte("end_date", contractsEndingCutoff),
  ]);

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

  const serviceDueCutoff = isoDaysFromNow(30);
  const servicingDueSoonCount = (vehicles ?? []).filter(
    (v) => v.next_service_date && v.next_service_date <= serviceDueCutoff
  ).length;

  const total = vehicles?.length ?? 0;

  return (
    <div className="flex flex-wrap gap-2">
      <StatLinkPill label="Fleet" value={total} subtitle="Total vehicles" href="/vehicles" />
      <StatLinkPill
        label="Active"
        value={counts.on_road}
        subtitle="On road"
        href="/vehicles?status=on_road"
      />
      <StatLinkPill label="Idle" value={counts.parked} subtitle="Parked" href="/vehicles?status=parked" />
      <StatLinkPill
        label="Workshop"
        value={counts.in_repair}
        subtitle="In repair"
        href="/vehicles?status=in_repair"
      />
      <StatLinkPill
        label="Servicing"
        value={servicingDueSoonCount}
        subtitle="Due within 30 days"
        href="/vehicles?service=due_soon"
      />
      <StatLinkPill
        label="Contracts"
        value={endingSoonCount ?? 0}
        subtitle="Ending within 3 months"
        href="/contracts?ending=soon"
      />
    </div>
  );
}
