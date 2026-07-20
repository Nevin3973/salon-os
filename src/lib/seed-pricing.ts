/**
 * Deterministic demo prices (INR, in paise) so the seeded catalogue looks
 * realistic without hand-pricing every SKU. Same product always gets the
 * same price. Used by the seed only — real catalogues set prices explicitly.
 */

// [min, max] rupees per category
const RANGE: Record<string, [number, number]> = {
  "Hair Care": [420, 1450],
  "Hair Colour": [260, 720],
  "Hair Treatments": [650, 2600],
  "Skin Care": [780, 3200],
  Facial: [700, 2900],
  Waxing: [380, 1600],
  "Nail Care": [240, 900],
  "Retail Products": [520, 1900],
  Tools: [450, 3800],
  Electrical: [3200, 16500],
  Furniture: [11000, 48000],
  "Cleaning Supplies": [220, 950],
  Consumables: [180, 780],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Returns a stable, realistic price in paise for a demo product. */
export function seedPriceMinor(name: string, category: string): number {
  const [min, max] = RANGE[category] ?? [300, 1200];
  const spread = max - min;
  const rupees = min + (hash(name) % (spread + 1));
  // Round to a tidy retail-looking number, then convert to paise.
  const rounded = rupees >= 5000 ? Math.round(rupees / 500) * 500 : Math.round(rupees / 10) * 10;
  return Math.max(min, rounded) * 100;
}
