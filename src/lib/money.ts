/**
 * Money is stored in minor units (paise for INR, cents for USD) as integers,
 * so arithmetic never drifts. Format only at the edges.
 */

export const DEFAULT_CURRENCY = "INR";

export function formatMoney(minorUnits: number, currency: string = DEFAULT_CURRENCY): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** Parses a user-typed amount ("1,299.50") into minor units. Returns null if invalid. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Line total for a quantity at a unit price, in minor units. */
export function lineTotal(unitPriceMinor: number, qty: number): number {
  return unitPriceMinor * qty;
}
