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
  /** (qty × unit price) − discount, exclusive of GST. */
  netCents: number;
  /** CGST + SGST together. */
  taxCents: number;
  /** netCents + taxCents. */
  totalCents: number;
  /** Half the tax; cgst + sgst always equals taxCents exactly. */
  cgstCents: number;
  sgstCents: number;
};

/**
 * GST for one line. `unitPriceCents` is pre-tax and `gstRate` a whole percent.
 * A discount is deducted BEFORE tax — under Indian GST a discount shown on the
 * invoice reduces the taxable value, so the customer is taxed on what they
 * actually pay. The discount is clamped so a line can never go negative.
 */
export function lineGst(
  unitPriceCents: number,
  qty: number,
  gstRate: number,
  discountCents = 0
): GstLine {
  const gross = Math.max(0, Math.round(unitPriceCents)) * Math.max(0, Math.round(qty));
  const discount = Math.min(Math.max(0, Math.round(discountCents)), gross);
  const netCents = gross - discount;
  const taxCents = Math.round((netCents * gstRate) / 100);
  // Split the tax into two equal halves that still sum to the exact total.
  const cgstCents = Math.floor(taxCents / 2);
  const sgstCents = taxCents - cgstCents;
  return { netCents, taxCents, totalCents: netCents + taxCents, cgstCents, sgstCents };
}

export type CartLineInput = {
  unitPriceCents: number;
  qty: number;
  gstRate: number;
  discountCents?: number;
};

export type BillTotals = {
  /** Taxable value after discounts. */
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  /** Signed adjustment that brings the bill to a whole rupee. */
  roundOffCents: number;
  /** What the customer pays, always a whole number of rupees. */
  totalCents: number;
};

/**
 * Rolls a set of lines up into bill totals, then rounds the payable amount to
 * the nearest rupee and records the adjustment — the "Round off" line every
 * Indian invoice carries, so the customer never has to hand over paise.
 */
export function billTotals(lines: CartLineInput[]): BillTotals {
  let subtotalCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  for (const l of lines) {
    const gross = Math.max(0, Math.round(l.unitPriceCents)) * Math.max(0, Math.round(l.qty));
    const g = lineGst(l.unitPriceCents, l.qty, l.gstRate, l.discountCents ?? 0);
    subtotalCents += g.netCents;
    discountCents += gross - g.netCents;
    taxCents += g.taxCents;
  }
  const beforeRounding = subtotalCents + taxCents;
  const totalCents = Math.round(beforeRounding / 100) * 100;
  return {
    subtotalCents,
    discountCents,
    taxCents,
    roundOffCents: totalCents - beforeRounding,
    totalCents,
  };
}

/** Groups tax by rate for the invoice's GST summary block. */
export function gstBreakdown(
  lines: (CartLineInput & { hsn?: string | null })[]
): { rate: number; taxableCents: number; cgstCents: number; sgstCents: number }[] {
  const byRate = new Map<number, { rate: number; taxableCents: number; cgstCents: number; sgstCents: number }>();
  for (const l of lines) {
    const g = lineGst(l.unitPriceCents, l.qty, l.gstRate, l.discountCents ?? 0);
    const row = byRate.get(l.gstRate) ?? { rate: l.gstRate, taxableCents: 0, cgstCents: 0, sgstCents: 0 };
    row.taxableCents += g.netCents;
    row.cgstCents += g.cgstCents;
    row.sgstCents += g.sgstCents;
    byRate.set(l.gstRate, row);
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

// ————————————————————————————————————————————————————————
// Invoice numbering — per branch, per financial year
// ————————————————————————————————————————————————————————

/**
 * The Indian financial year a date falls in, as a "25-26" label. The FY runs
 * 1 April to 31 March, so anything before April belongs to the year before.
 */
export function financialYear(d: Date = new Date()): string {
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const two = (y: number) => String(y % 100).padStart(2, "0");
  return `${two(startYear)}-${two(startYear + 1)}`;
}

/** "ROS", "25-26", 7 → "ROS/25-26/0007". */
export function formatInvoiceCode(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

/** Credit notes get their own prefix so they can never be mistaken for a sale. */
export function formatCreditNoteCode(prefix: string, fy: string, seq: number): string {
  return `CN/${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

/** Derives a branch's default invoice prefix from its name, e.g. "Rosewood Avenue" → "ROS". */
export function defaultPrefix(branchName: string): string {
  const letters = branchName.replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "BR";
}
