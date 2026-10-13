/**
 * Maps days-until-due to a red -> amber -> green colour scale, mirroring
 * the client's spreadsheet's conditional formatting. Blends the app's own
 * --destructive/--warning/--success tokens via CSS color-mix() rather than
 * hardcoding new colours, so it stays on-brand and dark-mode safe
 * automatically.
 *
 * 0 or fewer days (due today or overdue) is pure red, `horizonDays` or more
 * is pure green, fading smoothly through amber in between. Returns a cell
 * background plus a matching readable foreground — amber sits at a much
 * higher lightness than either red or green, so the right text colour
 * isn't the same at both ends and the middle (same shape the app's own
 * destructive/warning/success Badge variants already use).
 */
export function dueDateColorScale(
  daysUntilDue: number,
  horizonDays = 60
): { background: string; foreground: string } {
  const clamped = Math.max(0, Math.min(daysUntilDue, horizonDays));
  const t = clamped / horizonDays;

  // Approximate OKLCH lightness of each token, just to pick a readable
  // foreground — amber (~0.75) is lighter than either red (~0.68) or
  // green (~0.62), so lightness rises then falls across the scale.
  const L_RED = 0.68;
  const L_AMBER = 0.75;
  const L_GREEN = 0.62;

  let background: string;
  let lightness: number;

  if (t <= 0.5) {
    const pct = Math.round((t / 0.5) * 100);
    background = `color-mix(in oklch, var(--warning) ${pct}%, var(--destructive) ${100 - pct}%)`;
    lightness = L_RED + (L_AMBER - L_RED) * (pct / 100);
  } else {
    const pct = Math.round(((t - 0.5) / 0.5) * 100);
    background = `color-mix(in oklch, var(--success) ${pct}%, var(--warning) ${100 - pct}%)`;
    lightness = L_AMBER + (L_GREEN - L_AMBER) * (pct / 100);
  }

  const foreground =
    lightness > 0.72
      ? "var(--warning-foreground)"
      : t < 0.5
        ? "var(--destructive-foreground)"
        : "var(--success-foreground)";

  return { background, foreground };
}
