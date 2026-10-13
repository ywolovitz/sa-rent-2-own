/**
 * Maps days-until-due to a red -> amber -> green font colour, mirroring the
 * client's spreadsheet's colour-scale conditional formatting. Blends the
 * app's own --destructive/--warning/--success tokens via CSS color-mix()
 * rather than hardcoding new colours, so it stays on-brand and dark-mode
 * safe automatically.
 *
 * 0 or fewer days (due today or overdue) is pure red, `horizonDays` or more
 * is pure green, fading smoothly through amber in between.
 */
export function dueDateColor(daysUntilDue: number, horizonDays = 60): string {
  const clamped = Math.max(0, Math.min(daysUntilDue, horizonDays));
  const t = clamped / horizonDays;

  if (t <= 0.5) {
    const pct = Math.round((t / 0.5) * 100);
    return `color-mix(in oklch, var(--warning) ${pct}%, var(--destructive) ${100 - pct}%)`;
  }
  const pct = Math.round(((t - 0.5) / 0.5) * 100);
  return `color-mix(in oklch, var(--success) ${pct}%, var(--warning) ${100 - pct}%)`;
}
