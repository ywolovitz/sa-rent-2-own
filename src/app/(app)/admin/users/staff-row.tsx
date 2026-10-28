"use client";

import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatSaPhoneForDisplay } from "@/lib/phone";

import { StaffDetailsDialog, type StaffMember } from "./staff-details-dialog";

/** Clicking anywhere on the row opens the details modal; `whatsapp` and `actions` are the existing inline controls. */
export function StaffRow({
  member,
  isSelf,
  whatsapp,
  actions,
}: {
  member: StaffMember;
  isSelf: boolean;
  whatsapp: ReactNode;
  actions: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(true)}>
        <TableCell className="font-medium">{member.full_name}</TableCell>
        <TableCell>{formatSaPhoneForDisplay(member.phone)}</TableCell>
        <TableCell>
          <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
        </TableCell>
        <TableCell>
          <Badge variant={member.is_active ? "success" : "secondary"}>
            {member.is_active ? "Active" : "Deactivated"}
          </Badge>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>{whatsapp}</TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          {actions}
        </TableCell>
      </TableRow>
      <StaffDetailsDialog member={member} isSelf={isSelf} open={open} onOpenChange={setOpen} />
    </>
  );
}
