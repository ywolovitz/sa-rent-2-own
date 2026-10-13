/** ISO date (YYYY-MM-DD) for `days` from now, used to keep "due soon" cutoffs
 * consistent between the dashboard counts and the filtered table views they
 * link to. */
export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from today (local time) to an ISO date; negative
 * once the date is in the past. */
export function daysUntil(dateStr: string): number {
  const oneDay = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / oneDay);
}

/** Renders a day count as "N days" or "N months[, N days]", using
 * 30-day months — a countdown display doesn't need calendar precision. */
export function formatDayCount(days: number): string {
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  if (months === 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (remDays === 0) return `${months} month${months === 1 ? "" : "s"}`;
  return `${months} month${months === 1 ? "" : "s"}, ${remDays} day${remDays === 1 ? "" : "s"}`;
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Renders an ISO date (or datetime) string as "13 Oct 2026" for display.
 * Parses the "YYYY-MM-DD" portion directly rather than via `new Date()`,
 * since the latter treats a date-only string as UTC midnight — shifting
 * the displayed calendar date by a day in timezones behind UTC. */
export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "—";
  return `${String(day).padStart(2, "0")} ${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}
