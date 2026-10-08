import { Skeleton } from "@/components/ui/skeleton";

/** Shared instant-navigation placeholder for the Vehicles/Clients/Contracts/
 * Staff list pages — mirrors their title+toolbar+table shape so the swap to
 * real content doesn't jump. Rendered via each route's loading.tsx. */
export function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
        <div className="bg-muted/50 border-b p-3">
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="p-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
