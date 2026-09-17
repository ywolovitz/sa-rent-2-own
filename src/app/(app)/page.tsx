import { getCurrentProfile } from "@/lib/auth/current-profile";
import { FleetStatsCards } from "@/components/dashboard/fleet-stats-cards";
import { FleetMapPlaceholder } from "@/components/dashboard/fleet-map-placeholder";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile?.fullName.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm">Here&apos;s the state of the fleet.</p>
      </div>
      <FleetStatsCards />
      <FleetMapPlaceholder />
    </div>
  );
}
