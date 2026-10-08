import { LogOut } from "lucide-react";

import { logout } from "@/app/login/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/database.types";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({
  fullName,
  role,
  variant = "header",
  collapsed = false,
}: {
  fullName: string;
  role: UserRole;
  /** "header" is the light top-bar look (mobile only); "sidebar" matches
   * the dark sidebar it's now pinned to the bottom of on desktop. */
  variant?: "header" | "sidebar";
  collapsed?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "flex w-full items-center gap-2 px-2",
            variant === "sidebar" && "justify-start text-white/70 hover:bg-white/10 hover:text-white",
            variant === "sidebar" && collapsed && "justify-center px-2"
          )}
        >
          <Avatar className="size-7 shrink-0">
            <AvatarFallback>{initials(fullName)}</AvatarFallback>
          </Avatar>
          {!(variant === "sidebar" && collapsed) && (
            <span
              className={cn(
                "truncate text-sm font-medium",
                variant === "header" && "hidden sm:inline"
              )}
            >
              {fullName}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span>{fullName}</span>
          <Badge variant="secondary" className="w-fit capitalize">
            {role}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
