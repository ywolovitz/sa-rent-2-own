import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { isoDaysFromNow } from "@/lib/date-ranges";
import type { VehicleStatus } from "@/lib/database.types";

function StatCard({
  label,
  value,
  subtitle,
  href,
}: {
  label: string;
  value: number;
  subtitle: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      title={subtitle}
      className="bg-muted hover:bg-muted/70 flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors"
    >
      <span className="text-destructive text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </Link>
  );
}

/** Self-contained so it can drop into any page (Dashboard, Vehicles,
 * Contracts) without threading fleet-wide counts through each page's
 * own data-fetching. */
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
      <StatCard label="Fleet" value={total} subtitle="Total vehicles" href="/vehicles" />
      <StatCard
        label="Active"
        value={counts.on_road}
        subtitle="On road"
        href="/vehicles?status=on_road"
      />
      <StatCard label="Idle" value={counts.parked} subtitle="Parked" href="/vehicles?status=parked" />
      <StatCard
        label="Workshop"
        value={counts.in_repair}
        subtitle="In repair"
        href="/vehicles?status=in_repair"
      />
      <StatCard
        label="Servicing"
        value={servicingDueSoonCount}
        subtitle="Due within 30 days"
        href="/vehicles?service=due_soon"
      />
      <StatCard
        label="Contracts"
        value={endingSoonCount ?? 0}
        subtitle="Ending within 3 months"
        href="/contracts?ending=soon"
      />
    </div>
  );
}
