/**
 * Normalizes South African cell numbers to E.164 (+27...) for Supabase
 * phone auth. Accepts local format (0821234567), with-country-code
 * (27821234567), or already-E.164 (+27821234567), with any spaces or
 * dashes stripped first.
 */
export function normalizeSaPhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");

  if (/^\+27\d{9}$/.test(digits)) {
    return digits;
  }
  if (/^27\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  if (/^0\d{9}$/.test(digits)) {
    return `+27${digits.slice(1)}`;
  }

  return null;
}

/** Renders an E.164 SA number back to the familiar local 0-prefixed form for display. */
export function formatSaPhoneForDisplay(e164: string): string {
  const match = e164.match(/^\+27(\d{9})$/);
  if (!match) return e164;
  const local = `0${match[1]}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
