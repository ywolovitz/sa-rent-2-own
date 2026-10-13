/**
 * Maps days-until-due to a red -> amber -> green colour scale, mirroring
 * the client's spreadsheet's conditional formatting. 0 or fewer days (due
 * today or overdue) is pure red, `horizonDays` or more is pure green,
 * fading smoothly through amber in between.
 */

// Approximate OKLCH lightness of each token, used to pick a readable
// foreground — amber (~0.75) is lighter than either red (~0.68) or green
// (~0.62), so lightness rises then falls across the scale.
const L_RED = 0.68;
const L_AMBER = 0.75;
const L_GREEN = 0.62;

function progress(daysUntilDue: number, horizonDays: number) {
  const clamped = Math.max(0, Math.min(daysUntilDue, horizonDays));
  const t = clamped / horizonDays;
  const pct = t <= 0.5 ? Math.round((t / 0.5) * 100) : Math.round(((t - 0.5) / 0.5) * 100);
  return { t, pct };
}

/** Background + a matching readable foreground, for on-screen cell fills.
 * Blends the app's own --destructive/--warning/--success tokens via CSS
 * color-mix() rather than hardcoding new colours, so it stays on-brand and
 * dark-mode safe automatically. */
export function dueDateColorScale(
  daysUntilDue: number,
  horizonDays = 60
): { background: string; foreground: string } {
  const { t, pct } = progress(daysUntilDue, horizonDays);
  const lightness =
    t <= 0.5 ? L_RED + (L_AMBER - L_RED) * (pct / 100) : L_AMBER + (L_GREEN - L_AMBER) * (pct / 100);

  const background =
    t <= 0.5
      ? `color-mix(in oklch, var(--warning) ${pct}%, var(--destructive) ${100 - pct}%)`
      : `color-mix(in oklch, var(--success) ${pct}%, var(--warning) ${100 - pct}%)`;

  const foreground =
    lightness > 0.72
      ? "var(--warning-foreground)"
      : t < 0.5
        ? "var(--destructive-foreground)"
        : "var(--success-foreground)";

  return { background, foreground };
}

// Same three stops as the on-screen version, as plain hex — the same
// values already used for the Status/Paid chips in the Excel export
// (STATUS_CHIP_COLORS/PAID_CHIP_COLORS), so exported fills match the rest
// of the workbook.
const RED_RGB = [0xff, 0x52, 0x52];
const AMBER_RGB = [0xf0, 0xa8, 0x30];
const GREEN_RGB = [0x2f, 0x9e, 0x58];

function lerpRgb(from: number[], to: number[], frac: number): string {
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * frac));
  return "FF" + mix.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");
}

/** Excel chip colours (ARGB hex) for the same red -> amber -> green scale,
 * for use with ExportColumn's `chip`. */
export function dueDateExcelChip(
  daysUntilDue: number,
  horizonDays = 60
): { fill: string; font?: string } {
  const { t, pct } = progress(daysUntilDue, horizonDays);
  const lightness =
    t <= 0.5 ? L_RED + (L_AMBER - L_RED) * (pct / 100) : L_AMBER + (L_GREEN - L_AMBER) * (pct / 100);

  const fill =
    t <= 0.5 ? lerpRgb(RED_RGB, AMBER_RGB, pct / 100) : lerpRgb(AMBER_RGB, GREEN_RGB, pct / 100);

  return { fill, font: lightness > 0.72 ? "FF1F1F1F" : undefined };
}
