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
