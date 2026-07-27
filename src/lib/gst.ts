/**
 * GST maths for customer invoices. Everything is in integer minor units
 * (paise) so nothing drifts. Retail prices are held exclusive of GST; the tax
 * is added on top per line and summed into the bill.
 *
 * A salon sells at its own counter, so the customer is always in the same
 * state as the branch: an intra-state supply, taxed as CGST + SGST (each half
 * the rate). Inter-state (IGST) is not modelled — it cannot arise at a
 * walk-in point of sale.
 */

export type GstLine = {
  /** qty × unit price, exclusive of GST. */
  netCents: number;
  /** CGST + SGST together. */
  taxCents: number;
  /** netCents + taxCents. */
  totalCents: number;
  /** Half the tax; cgst + sgst always equals taxCents exactly. */
  cgstCents: number;
  sgstCents: number;
};

/** GST for one line. `unitPriceCents` is pre-tax; `gstRate` is a whole percent. */
export function lineGst(unitPriceCents: number, qty: number, gstRate: number): GstLine {
  const netCents = Math.max(0, Math.round(unitPriceCents)) * Math.max(0, Math.round(qty));
  const taxCents = Math.round((netCents * gstRate) / 100);
  // Split the tax into two equal halves that still sum to the exact total.
  const cgstCents = Math.floor(taxCents / 2);
  const sgstCents = taxCents - cgstCents;
  return { netCents, taxCents, totalCents: netCents + taxCents, cgstCents, sgstCents };
}

export type CartLineInput = { unitPriceCents: number; qty: number; gstRate: number };

/** Rolls a set of lines up into bill totals. */
export function billTotals(lines: CartLineInput[]) {
  let subtotalCents = 0;
  let taxCents = 0;
  for (const l of lines) {
    const g = lineGst(l.unitPriceCents, l.qty, l.gstRate);
    subtotalCents += g.netCents;
    taxCents += g.taxCents;
  }
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** Groups tax by rate for the invoice's GST summary block. */
export function gstBreakdown(
  lines: (CartLineInput & { hsn?: string | null })[]
): { rate: number; taxableCents: number; cgstCents: number; sgstCents: number }[] {
  const byRate = new Map<number, { rate: number; taxableCents: number; cgstCents: number; sgstCents: number }>();
  for (const l of lines) {
    const g = lineGst(l.unitPriceCents, l.qty, l.gstRate);
    const row = byRate.get(l.gstRate) ?? { rate: l.gstRate, taxableCents: 0, cgstCents: 0, sgstCents: 0 };
    row.taxableCents += g.netCents;
    row.cgstCents += g.cgstCents;
    row.sgstCents += g.sgstCents;
    byRate.set(l.gstRate, row);
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

/** Invoice display number, e.g. 42 → "INV-0042". */
export function invoiceCode(invoiceNo: number): string {
  return `INV-${String(invoiceNo).padStart(4, "0")}`;
}
