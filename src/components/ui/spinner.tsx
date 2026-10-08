import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** A centered loading spinner — used as the whole-page pending state
 * (route loading.tsx) instead of a skeleton, since a pulsing grey block
 * read as "the page went blank" rather than "this is loading". */
export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-1 items-center justify-center py-16", className)}>
      <Loader2 className="text-muted-foreground size-8 animate-spin" />
    </div>
  );
}
