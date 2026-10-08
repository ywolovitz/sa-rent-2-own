import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <Skeleton className="h-80 lg:w-2/3" />
        <div className="flex flex-col gap-4 lg:w-1/3">
          <Skeleton className="h-[216px]" />
          <Skeleton className="h-[216px]" />
        </div>
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
