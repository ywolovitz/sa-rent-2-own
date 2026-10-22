"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/** "brand": always the system's brand blue with white text (used for the
 * Fleet total pill), regardless of active state. */
export type PillTone = "brand";

function pillClassName(isActive?: boolean, tone?: PillTone) {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
    tone === "brand"
      ? "bg-[var(--brand-blue-dark)] text-white hover:bg-[var(--brand-blue-dark)]/90"
      : isActive
        ? "bg-primary text-primary-foreground"
        : "bg-muted hover:bg-muted/70"
  );
}

function PillContent({
  label,
  value,
  isActive,
  tone,
}: {
  label: string;
  value: number;
  isActive?: boolean;
  tone?: PillTone;
}) {
  return (
    <>
      <span
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          tone === "brand" || isActive ? "text-primary-foreground" : "text-destructive",
          tone === "brand" && "text-white"
        )}
      >
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </>
  );
}

/** A stat pill that navigates — for a filter whose data lives on a
 * different page than the one it's rendered on. */
export function StatLinkPill({
  label,
  value,
  subtitle,
  href,
  isActive,
}: {
  label: string;
  value: number;
  subtitle: string;
  href: string;
  isActive?: boolean;
}) {
  return (
    <Link
      href={href}
      title={subtitle}
      aria-current={isActive ? "true" : undefined}
      className={pillClassName(isActive)}
    >
      <PillContent label={label} value={value} isActive={isActive} />
    </Link>
  );
}

/** A stat pill that toggles local state instead of navigating — for a
 * filter whose data is already loaded on the page it's rendered on, so
 * clicking it should behave exactly like the filter dropdown next to it
 * (instant, no round-trip), not like a link to a different view. */
export function StatButtonPill({
  label,
  value,
  subtitle,
  onClick,
  isActive,
  tone,
}: {
  label: string;
  value: number;
  subtitle: string;
  onClick: () => void;
  isActive?: boolean;
  tone?: PillTone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={subtitle}
      aria-pressed={isActive}
      className={pillClassName(isActive, tone)}
    >
      <PillContent label={label} value={value} isActive={isActive} tone={tone} />
    </button>
  );
}
