import { describe, it, expect } from "vitest";
import {
  lineGst,
  billTotals,
  gstBreakdown,
  financialYear,
  formatInvoiceCode,
  formatCreditNoteCode,
  defaultPrefix,
} from "./gst";

describe("lineGst", () => {
  it("charges GST on qty × price", () => {
    const g = lineGst(10_000, 3, 18);
    expect(g.netCents).toBe(30_000);
    expect(g.taxCents).toBe(5_400);
    expect(g.totalCents).toBe(35_400);
  });

  it("splits tax into halves that always sum to the exact total", () => {
    // 5% of ₹100.01 → 500.05 paise → rounds to 500, an odd number of paise
    // would leave cgst+sgst ≠ tax if halves were rounded independently.
    for (const price of [10_001, 3_333, 7, 99_999]) {
      const g = lineGst(price, 1, 5);
      expect(g.cgstCents + g.sgstCents).toBe(g.taxCents);
    }
  });

  it("deducts a discount before tax, as Indian GST requires", () => {
    const g = lineGst(10_000, 2, 18, 5_000);
    expect(g.netCents).toBe(15_000); // 20_000 − 5_000
    expect(g.taxCents).toBe(2_700); // 18% of the DISCOUNTED value
    expect(g.totalCents).toBe(17_700);
  });

  it("never lets a discount push a line negative", () => {
    const g = lineGst(1_000, 1, 18, 999_999);
    expect(g.netCents).toBe(0);
    expect(g.taxCents).toBe(0);
    expect(g.totalCents).toBe(0);
  });

  it("treats a zero rate as tax-free", () => {
    const g = lineGst(12_345, 2, 0);
    expect(g.taxCents).toBe(0);
    expect(g.totalCents).toBe(24_690);
  });

  it("clamps negative quantities and prices to zero", () => {
    expect(lineGst(-500, 2, 18).netCents).toBe(0);
    expect(lineGst(500, -2, 18).netCents).toBe(0);
  });
});

describe("billTotals", () => {
  it("rounds the payable amount to a whole rupee and records the adjustment", () => {
    // 1 × ₹99.99 + 18% = ₹117.99 (11_799 paise) → rounds down to ₹118? No:
    // 11_799 → nearest 100 is 11_800, so +1 paisa.
    const t = billTotals([{ unitPriceCents: 9_999, qty: 1, gstRate: 18 }]);
    expect(t.totalCents % 100).toBe(0);
    expect(t.subtotalCents + t.taxCents + t.roundOffCents).toBe(t.totalCents);
  });

  it("keeps the round-off within half a rupee either way", () => {
    for (const price of [1, 33, 4_567, 99_999, 123_456]) {
      const t = billTotals([{ unitPriceCents: price, qty: 3, gstRate: 12 }]);
      expect(Math.abs(t.roundOffCents)).toBeLessThanOrEqual(50);
      expect(t.totalCents % 100).toBe(0);
    }
  });

  it("totals discounts across lines", () => {
    const t = billTotals([
      { unitPriceCents: 10_000, qty: 1, gstRate: 18, discountCents: 1_000 },
      { unitPriceCents: 20_000, qty: 2, gstRate: 18, discountCents: 5_000 },
    ]);
    expect(t.discountCents).toBe(6_000);
    expect(t.subtotalCents).toBe(9_000 + 35_000);
  });

  it("is zero for an empty bill", () => {
    const t = billTotals([]);
    expect(t).toMatchObject({ subtotalCents: 0, taxCents: 0, totalCents: 0, roundOffCents: 0 });
  });
});

describe("gstBreakdown", () => {
  it("groups taxable value by rate and halves the tax per group", () => {
    const rows = gstBreakdown([
      { unitPriceCents: 10_000, qty: 1, gstRate: 18 },
      { unitPriceCents: 20_000, qty: 1, gstRate: 18 },
      { unitPriceCents: 5_000, qty: 1, gstRate: 12 },
    ]);
    expect(rows.map((r) => r.rate)).toEqual([12, 18]);
    const eighteen = rows.find((r) => r.rate === 18)!;
    expect(eighteen.taxableCents).toBe(30_000);
    expect(eighteen.cgstCents + eighteen.sgstCents).toBe(5_400);
  });

  it("reflects discounts in the taxable value", () => {
    const [row] = gstBreakdown([
      { unitPriceCents: 10_000, qty: 1, gstRate: 18, discountCents: 2_000 },
    ]);
    expect(row.taxableCents).toBe(8_000);
  });
});

describe("financialYear", () => {
  it("starts a new year on 1 April", () => {
    expect(financialYear(new Date("2026-03-31T12:00:00"))).toBe("25-26");
    expect(financialYear(new Date("2026-04-01T12:00:00"))).toBe("26-27");
  });

  it("puts January in the year that began the previous April", () => {
    expect(financialYear(new Date("2026-01-15T12:00:00"))).toBe("25-26");
  });

  it("pads single-digit years", () => {
    expect(financialYear(new Date("2009-06-01T12:00:00"))).toBe("09-10");
  });
});

describe("invoice numbering", () => {
  it("formats a padded per-branch, per-year code", () => {
    expect(formatInvoiceCode("ROS", "25-26", 7)).toBe("ROS/25-26/0007");
    expect(formatInvoiceCode("ROS", "25-26", 12_345)).toBe("ROS/25-26/12345");
  });

  it("marks credit notes distinctly so they can't be read as invoices", () => {
    expect(formatCreditNoteCode("ROS", "25-26", 3)).toBe("CN/ROS/25-26/0003");
  });

  it("derives a three-letter prefix from a branch name", () => {
    expect(defaultPrefix("Rosewood Avenue")).toBe("ROS");
    expect(defaultPrefix("Marina Walk")).toBe("MAR");
    expect(defaultPrefix("77")).toBe("BR"); // nothing usable → safe fallback
  });
});
