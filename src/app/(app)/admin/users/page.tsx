import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSaPhoneForDisplay } from "@/lib/phone";

import { NewStaffDialog } from "./new-staff-dialog";
import { StaffActiveToggle } from "./staff-active-toggle";

export default async function StaffPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, is_active")
    .order("full_name");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-muted-foreground text-sm">
            Accounts log in with a cell number and password — no email required.
          </p>
        </div>
        <NewStaffDialog />
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Cell number</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(staff ?? []).map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.full_name}</TableCell>
                <TableCell>{formatSaPhoneForDisplay(member.phone)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={member.is_active ? "success" : "secondary"}>
                    {member.is_active ? "Active" : "Deactivated"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {member.id !== profile.id && (
                    <StaffActiveToggle userId={member.id} isActive={member.is_active} />
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(staff ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center py-8">
                  No staff accounts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
