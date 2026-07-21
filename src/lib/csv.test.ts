import { describe, it, expect } from "vitest";
import { toCsv, csvMoney, csvFilename, type CsvColumn } from "./csv";

type Row = { name: string; qty: number; note: string | null };

const columns: CsvColumn<Row>[] = [
  { header: "Product", value: (r) => r.name },
  { header: "Qty", value: (r) => r.qty },
  { header: "Note", value: (r) => r.note },
];

/** Strips the Excel BOM and splits into lines for easier assertions. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

describe("toCsv", () => {
  it("writes a header row even with no data", () => {
    expect(lines(toCsv(columns, []))).toEqual(["Product,Qty,Note"]);
  });

  it("starts with a BOM so Excel reads it as UTF-8", () => {
    expect(toCsv(columns, [])).toMatch(/^﻿/);
  });

  it("leaves plain values unquoted", () => {
    const csv = lines(toCsv(columns, [{ name: "Argan Oil", qty: 3, note: null }]));
    expect(csv[1]).toBe("Argan Oil,3,");
  });

  it("quotes and escapes commas, quotes and newlines", () => {
    const csv = lines(
      toCsv(columns, [{ name: 'Shampoo, 1L', qty: 2, note: 'He said "later"' }])
    );
    expect(csv[1]).toBe('"Shampoo, 1L",2,"He said ""later"""');
  });

  it("keeps an embedded newline inside one quoted field", () => {
    const csv = toCsv(columns, [{ name: "Gloves", qty: 1, note: "line one\nline two" }]);
    expect(csv).toContain('"line one\nline two"');
  });

  it("defuses values Excel would run as a formula", () => {
    const csv = lines(toCsv(columns, [{ name: "=1+1", qty: 1, note: "@SUM(A1)" }]));
    expect(csv[1]).toBe("'=1+1,1,'@SUM(A1)");
  });

  it("renders null and undefined as empty cells, not the words", () => {
    const csv = lines(toCsv(columns, [{ name: "Serum", qty: 0, note: null }]));
    expect(csv[1]).toBe("Serum,0,");
  });
});

describe("csvMoney", () => {
  it("converts minor units to a two-decimal string", () => {
    expect(csvMoney(129950)).toBe("1299.50");
    expect(csvMoney(0)).toBe("0.00");
    expect(csvMoney(5)).toBe("0.05");
  });

  it("emits a bare number so spreadsheets can sum it", () => {
    expect(csvMoney(129950)).not.toMatch(/[₹,]/);
  });
});

describe("csvFilename", () => {
  it("stamps the dataset and date", () => {
    expect(csvFilename("orders", new Date("2026-07-21T10:00:00Z"))).toBe(
      "beyond-demands-orders-2026-07-21.csv"
    );
  });
});
