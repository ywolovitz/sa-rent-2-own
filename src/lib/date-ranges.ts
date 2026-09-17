/** ISO date (YYYY-MM-DD) for `days` from now, used to keep "due soon" cutoffs
 * consistent between the dashboard counts and the filtered table views they
 * link to. */
export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
