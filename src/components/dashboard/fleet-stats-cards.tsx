import Link from "next/link";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { isoDaysFromNow } from "@/lib/date-ranges";
import type { VehicleStatus } from "@/lib/database.types";

export type FleetStatFilter = "fleet" | "on_road" | "parked" | "in_repair" | "due_soon" | "ending_soon";

function StatCard({
  label,
  value,
  subtitle,
  href,
  isActive,
}: {
  label: string;
  value: number;
  subtitle: string;
  href: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      title={subtitle}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
        isActive ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
      )}
    >
      <span
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          isActive ? "text-primary-foreground" : "text-destructive"
        )}
      >
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </Link>
  );
}

/** Self-contained so it can drop into any page (Dashboard, Vehicles,
 * Contracts) without threading fleet-wide counts through each page's
 * own data-fetching. `active` lets the calling page (which already knows
 * its own current filter from searchParams) highlight the matching card —
 * these cards are real filters, not just a static summary, so the current
 * one should look selected. */
export async function FleetStatsCards({ active }: { active?: FleetStatFilter } = {}) {
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
      <StatCard
        label="Fleet"
        value={total}
        subtitle="Total vehicles"
        href="/vehicles"
        isActive={active === "fleet"}
      />
      <StatCard
        label="Active"
        value={counts.on_road}
        subtitle="On road"
        href="/vehicles?status=on_road"
        isActive={active === "on_road"}
      />
      <StatCard
        label="Idle"
        value={counts.parked}
        subtitle="Parked"
        href="/vehicles?status=parked"
        isActive={active === "parked"}
      />
      <StatCard
        label="Workshop"
        value={counts.in_repair}
        subtitle="In repair"
        href="/vehicles?status=in_repair"
        isActive={active === "in_repair"}
      />
      <StatCard
        label="Servicing"
        value={servicingDueSoonCount}
        subtitle="Due within 30 days"
        href="/vehicles?service=due_soon"
        isActive={active === "due_soon"}
      />
      <StatCard
        label="Contracts"
        value={endingSoonCount ?? 0}
        subtitle="Ending within 3 months"
        href="/contracts?ending=soon"
        isActive={active === "ending_soon"}
      />
    </div>
  );
}
