import { Car, ClipboardList, Wrench, Warehouse } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VehicleStatus } from "@/lib/database.types";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="text-muted-foreground size-4" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
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

  const ninetyDaysOut = new Date();
  ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);
  const { count: endingSoonCount } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .lte("end_date", ninetyDaysOut.toISOString().slice(0, 10));

  const total = vehicles?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile?.fullName.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">Here&apos;s the state of the fleet.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total vehicles" value={total} icon={Car} />
        <StatCard label="On road" value={counts.on_road} icon={Warehouse} />
        <StatCard label="In repair" value={counts.in_repair} icon={Wrench} />
        <StatCard
          label="Contracts ending (90d)"
          value={endingSoonCount ?? 0}
          icon={ClipboardList}
        />
      </div>
    </div>
  );
}
