import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { daysUntil } from "@/lib/date-ranges";

import { FleetDeadlinesChartClient, type DeadlineWeekDatum } from "./fleet-deadlines-chart-client";

const WEEKS_AHEAD = 8;

/** Buckets a date into the week it falls in, counting from this week (0)
 * forward; past dates and anything beyond the window are excluded — this
 * chart is forward-looking only. */
function weekBucket(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = daysUntil(dateStr);
  if (diff < 0) return null;
  const bucket = Math.floor(diff / 7);
  return bucket < WEEKS_AHEAD ? bucket : null;
}

/** Manager/admin only — the contract end dates it charts are blocked by
 * the same RLS policy that denies technicians all contract/financial
 * data (see FleetValueChart). */
export async function FleetDeadlinesChart() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: contracts }] = await Promise.all([
    supabase.from("vehicles").select("next_service_date, license_disc_expiry"),
    supabase.from("contracts").select("end_date").eq("status", "active"),
  ]);

  const weeks: DeadlineWeekDatum[] = Array.from({ length: WEEKS_AHEAD }, (_, i) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + i * 7);
    return { week: format(weekStart, "d MMM"), service: 0, contractEnding: 0, licenseExpiring: 0 };
  });

  for (const v of vehicles ?? []) {
    const serviceBucket = weekBucket(v.next_service_date);
    if (serviceBucket !== null) weeks[serviceBucket].service += 1;

    const licenseBucket = weekBucket(v.license_disc_expiry);
    if (licenseBucket !== null) weeks[licenseBucket].licenseExpiring += 1;
  }

  for (const c of contracts ?? []) {
    const bucket = weekBucket(c.end_date);
    if (bucket !== null) weeks[bucket].contractEnding += 1;
  }

  return (
    <div className="flex h-72 flex-col rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold tracking-tight">Upcoming deadlines</h3>
          <p className="text-muted-foreground text-sm">
            Service, contract, and license deadlines over the next {WEEKS_AHEAD} weeks
          </p>
        </div>
        <Badge variant="secondary">Active</Badge>
      </div>
      <div className="min-h-0 flex-1">
        <FleetDeadlinesChartClient data={weeks} />
      </div>
    </div>
  );
}
