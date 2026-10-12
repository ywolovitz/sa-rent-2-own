// Maps the free-text `vehicles.colour` field (whatever the client's
// spreadsheet/staff typed in — "Metallic Silver", "Pearl White", "Silver/Grey",
// etc.) to a representative swatch colour. Ordered most-specific-first so
// e.g. "Off White" matches before the generic "White" entry.
const COLOUR_KEYWORDS: Array<[string[], string]> = [
  [["rose gold"], "#B76E79"],
  [["champagne"], "#D4C298"],
  [["gunmetal"], "#2A3439"],
  [["charcoal"], "#36454F"],
  [["titanium"], "#878681"],
  [["bronze"], "#8C6239"],
  [["burgundy", "wine", "maroon"], "#6E1423"],
  [["navy"], "#1B1F3B"],
  [["turquoise", "teal"], "#0F7E7E"],
  [["lime"], "#9ACD32"],
  [["olive"], "#708238"],
  [["off white", "offwhite", "ivory", "cream"], "#F3ECDD"],
  [["beige", "sand", "stone", "taupe", "tan"], "#D8C9A3"],
  [["pearl"], "#F2F1ED"],
  [["white"], "#FFFFFF"],
  [["silver"], "#C7C9CB"],
  [["grey", "gray"], "#808285"],
  [["black"], "#1A1A1A"],
  [["red"], "#C62828"],
  [["orange"], "#E8720C"],
  [["yellow"], "#F2C230"],
  [["gold"], "#C9A646"],
  [["brown"], "#6E4A2E"],
  [["green"], "#2E7D32"],
  [["blue"], "#1565C0"],
  [["purple", "violet"], "#6A3FA0"],
  [["pink", "magenta"], "#D6568C"],
];

/** Resolves a free-text colour name to a representative hex swatch, or null if unrecognized. */
export function resolveVehicleColourHex(name: string): string | null {
  const normalized = name.toLowerCase();
  for (const [keywords, hex] of COLOUR_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return hex;
    }
  }
  return null;
}
