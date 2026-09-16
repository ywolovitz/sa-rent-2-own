"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { setStaffActive } from "./actions";

export function StaffActiveToggle({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await setStaffActive(userId, !isActive);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isActive ? "Account deactivated" : "Account reactivated");
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={isPending}>
      {isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
