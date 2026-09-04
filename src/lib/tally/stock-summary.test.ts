import { describe, it, expect } from "vitest";
import { splitGroup, parseAmountCents, parseQty, mapRows, skuFor } from "./stock-summary";

// Every group name below is taken verbatim from the client's own export, typos
// and double spaces included — that file is the contract this code has to meet.
describe("splitGroup", () => {
  it("reads brand and channel off the real group names", () => {
    expect(splitGroup("LOREAL RETAIL")).toEqual({ brand: "LOREAL", channel: "RETAIL" });
    expect(splitGroup("LOREAL SALON")).toEqual({ brand: "LOREAL", channel: "SALON" });
    expect(splitGroup("DAVINS SALOON")).toEqual({ brand: "DAVINS", channel: "SALON" });
    expect(splitGroup("GODREJ SALOON")).toEqual({ brand: "GODREJ", channel: "SALON" });
  });

  it("survives the spelling in the live file", () => {
    // Two spaces before SALON.
    expect(splitGroup("KANPEKI  SALON")).toEqual({ brand: "KANPEKI", channel: "SALON" });
    // Trailing lower-case n.
    expect(splitGroup("NAASHI SALOn")).toEqual({ brand: "NAASHI", channel: "SALON" });
  });

  it("keeps unsuffixed groups whole and treats them as salon use", () => {
    // Guards the till: an unrecognised group must never default to sellable.
    expect(splitGroup("CONSUMABLES")).toEqual({ brand: "CONSUMABLES", channel: "SALON" });
    expect(splitGroup("SALON EQUIPEMENT")).toEqual({ brand: "SALON EQUIPEMENT", channel: "SALON" });
    expect(splitGroup("LOREAL COLOR")).toEqual({ brand: "LOREAL COLOR", channel: "SALON" });
    expect(splitGroup("NYKAA")).toEqual({ brand: "NYKAA", channel: "SALON" });
  });

  it("does not mistake SALOON for SALON and leave a stray O", () => {
    expect(splitGroup("QOD SALOON").brand).toBe("QOD");
  });
});

describe("parseAmountCents", () => {
  it("reads Tally's formatting", () => {
    expect(parseAmountCents("25,548.47")).toBe(2_554_847);
    expect(parseAmountCents("126.98")).toBe(12_698);
    expect(parseAmountCents(9246.3)).toBe(924_630);
    expect(parseAmountCents("0.01")).toBe(1);
  });

  it("returns null for an empty cell rather than zero", () => {
    // A blank rate is "unknown", not "free" — they must not collapse together.
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("   ")).toBeNull();
    expect(parseAmountCents(null)).toBeNull();
    expect(parseAmountCents(undefined)).toBeNull();
  });

  it("reads a bracketed negative", () => {
    expect(parseAmountCents("(1,200.00)")).toBe(-120_000);
  });
});

describe("parseQty", () => {
  it("strips the unit Tally appends", () => {
    expect(parseQty("92 Nos")).toBe(92);
    expect(parseQty("2,883 pcs")).toBe(2883);
    expect(parseQty("1")).toBe(1);
  });

  it("truncates a fractional count to whole units", () => {
    expect(parseQty("2.5 Ltr")).toBe(2);
  });

  it("returns null when there is no number", () => {
    expect(parseQty("")).toBeNull();
    expect(parseQty("Nos")).toBeNull();
  });
});

describe("mapRows", () => {
  it("keeps an item Tally values but has no stock of, at zero", () => {
    const rows = mapRows([
      { group: "BOMBINI SALOON", name: "BOMBINI DONUT PEDICURE", qty: null, rateCents: null, valueCents: 93_937 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(0);
    expect(rows[0].priceCents).toBe(0);
    expect(rows[0].channel).toBe("SALON");
  });

  it("carries the Tally group through as the category, spelling intact", () => {
    const [row] = mapRows([
      { group: "SALON EQUIPEMENT", name: "ASTRO LED LAMP(48W)", qty: 1, rateCents: 139_831, valueCents: 139_831 },
    ]);
    expect(row.category).toBe("SALON EQUIPEMENT");
  });

  it("skips a row with no name", () => {
    expect(mapRows([{ group: "NYKAA", name: "  ", qty: 1, rateCents: 1, valueCents: 1 }])).toEqual([]);
  });
});

describe("skuFor", () => {
  it("is stable, so re-importing the same file updates instead of duplicating", () => {
    expect(skuFor("LOREAL RETAIL", "LOREAL ABSOLUTE MOLECULAR MASK 250 ML")).toBe(
      skuFor("LOREAL RETAIL", "LOREAL ABSOLUTE MOLECULAR MASK 250 ML")
    );
  });

  it("ignores casing and spacing noise that Tally users introduce", () => {
    expect(skuFor("KANPEKI SALON", "Kanpeki  Blanch")).toBe(skuFor("KANPEKI  SALON", "KANPEKI BLANCH"));
  });

  it("separates the retail and salon versions of one product name", () => {
    // Same bottle, two groups, two different cost bases — they are two products.
    expect(skuFor("QOD RETAIL", "QOD ARGAN CONDITIONER 300ML")).not.toBe(
      skuFor("QOD SALON", "QOD ARGAN CONDITIONER 300ML")
    );
  });
});
