import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canEdit } from "@/lib/auth/permissions";

import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile || !canEdit(profile.role)) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <AdminTabs />
      </div>
      {children}
    </div>
  );
}
