"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { setStaffWhatsAppAccess } from "./actions";

export function StaffWhatsAppToggle({
  userId,
  enabled,
  disabled,
}: {
  userId: string;
  enabled: boolean;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await setStaffWhatsAppAccess(userId, !enabled);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(enabled ? "WhatsApp access removed" : "WhatsApp access approved");
    });
  }

  return (
    <Button variant={enabled ? "secondary" : "ghost"} size="sm" onClick={onClick} disabled={isPending || disabled}>
      {enabled ? "Approved — remove" : "Approve"}
    </Button>
  );
}
