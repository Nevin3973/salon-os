import { describe, it, expect } from "vitest";
import { transferTotals, type TransferLine } from "./transfer-invoice";

/**
 * The four lines below are the client's real warehouse-to-salon invoice
 * (Atmosot → L Studio East Fort, 31-Aug-26). Every figure asserted here is
 * read off that printed document, so this test fails the moment our arithmetic
 * stops agreeing with Tally's.
 */
const REAL_INVOICE: TransferLine[] = [
  { productId: "p1", name: "LOREAL SHADE MAJIREL 4", hsn: "33059090", unit: "NOS", qty: 5, rateCents: 41_102, gstRate: 18 },
  { productId: "p2", name: "LOREAL INOA 20 VOL", hsn: "33059090", unit: "NOS", qty: 1, rateCents: 111_864, gstRate: 18 },
  { productId: "p3", name: "LOREAL INOA 30 VOL", hsn: "33059090", unit: "NOS", qty: 1, rateCents: 101_695, gstRate: 18 },
  { productId: "p4", name: "LOREAL 30 VOL 890ML", hsn: "33059090", unit: "NOS", qty: 1, rateCents: 71_186, gstRate: 18 },
];

describe("transferTotals", () => {
  it("reproduces the client's Tally invoice to the paise", () => {
    const t = transferTotals(REAL_INVOICE);
    expect(t.subtotalCents).toBe(490_255); // 4,902.55
    expect(t.cgstCents).toBe(44_124); //       441.24
    expect(t.sgstCents).toBe(44_124); //       441.24
    expect(t.taxCents).toBe(88_248); //        882.48
    expect(t.roundOffCents).toBe(-3); //        (-)0.03
    expect(t.totalCents).toBe(578_500); //   5,785.00
  });

  it("splits the tax into two equal halves, as Tally prints them", () => {
    // Tally rounds each half at 9% per line rather than halving an 18% figure.
    // Halving would give 441.22 / 441.24 here — an asymmetry Tally never shows.
    const t = transferTotals(REAL_INVOICE);
    expect(t.cgstCents).toBe(t.sgstCents);
  });

  it("keeps the line figures adding up to the totals", () => {
    const t = transferTotals(REAL_INVOICE);
    expect(t.lines.reduce((s, l) => s + l.taxableCents, 0)).toBe(t.subtotalCents);
    expect(t.lines.reduce((s, l) => s + l.cgstCents + l.sgstCents, 0)).toBe(t.taxCents);
    expect(t.subtotalCents + t.taxCents + t.roundOffCents).toBe(t.totalCents);
  });

  it("always lands on a whole rupee", () => {
    for (const qty of [1, 3, 7, 11, 13]) {
      const t = transferTotals([{ ...REAL_INVOICE[0], qty }]);
      expect(t.totalCents % 100).toBe(0);
      expect(Math.abs(t.roundOffCents)).toBeLessThanOrEqual(50);
    }
  });

  it("charges nothing on a nil-rated line", () => {
    const t = transferTotals([{ ...REAL_INVOICE[0], gstRate: 0 }]);
    expect(t.taxCents).toBe(0);
    expect(t.subtotalCents).toBe(205_510);
  });
});
