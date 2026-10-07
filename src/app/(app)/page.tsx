import { getCurrentProfile } from "@/lib/auth/current-profile";
import { FleetStatsCards } from "@/components/dashboard/fleet-stats-cards";
import { FleetMapPlaceholder } from "@/components/dashboard/fleet-map-placeholder";
import { FleetValueChart } from "@/components/dashboard/fleet-value-chart";
import { FleetStatusPieChart } from "@/components/dashboard/fleet-status-pie-chart";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile?.fullName.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">Here&apos;s the state of the fleet.</p>
      </div>
      <FleetStatsCards />
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-2/3">
          <FleetMapPlaceholder />
        </div>
        <div className="flex flex-col gap-4 lg:w-1/3">
          {canManage && <FleetValueChart />}
          <FleetStatusPieChart />
        </div>
      </div>
    </div>
  );
}
