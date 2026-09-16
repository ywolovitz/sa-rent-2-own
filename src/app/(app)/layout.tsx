import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="hidden w-56 shrink-0 border-r bg-background md:block">
        <div className="flex h-14 items-center border-b px-4 font-semibold tracking-tight">
          SAR2O Fleet
        </div>
        <SidebarNav role={profile.role} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="font-semibold tracking-tight md:hidden">SAR2O Fleet</div>
          <div className="ml-auto flex items-center gap-2">
            <UserMenu fullName={profile.fullName} role={profile.role} />
          </div>
        </header>
        <main className="flex-1 bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
