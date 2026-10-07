import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

import { FleetValueChartClient } from "./fleet-value-chart-client";

/** Manager/admin only — mirrors the contracts RLS policy, which denies
 * technicians all financial/contract data. */
export async function FleetValueChart() {
  const supabase = await createClient();

  const { data: contracts } = await supabase
    .from("contracts")
    .select("purchase_price, total_collected")
    .eq("status", "active");

  const totalPurchasePrice = (contracts ?? []).reduce((sum, c) => sum + (c.purchase_price ?? 0), 0);
  const totalCollected = (contracts ?? []).reduce((sum, c) => sum + (c.total_collected ?? 0), 0);

  const data = [
    { name: "Purchase price", value: totalPurchasePrice, color: "var(--brand-blue-dark)" },
    { name: "Total collected", value: totalCollected, color: "var(--color-success)" },
  ];

  return (
    <div className="flex flex-1 flex-col rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold tracking-tight">Fleet value</h3>
          <p className="text-muted-foreground text-sm">Active contracts: purchase price vs. collected</p>
        </div>
        <Badge variant="secondary">Active</Badge>
      </div>
      <div className="h-36">
        <FleetValueChartClient data={data} />
      </div>
    </div>
  );
}
