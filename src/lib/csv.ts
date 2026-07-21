/**
 * CSV writing for the export endpoints.
 *
 * Values are quoted per RFC 4180 and the file is prefixed with a UTF-8 BOM so
 * Excel on Windows opens ₹/accented names correctly instead of mojibake.
 * Money is written as a plain decimal (1299.50) rather than a formatted
 * currency string so spreadsheets can sum it.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
};

const BOM = "﻿";

function cell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  // A leading =, +, - or @ makes Excel treat the cell as a formula; prefix a
  // single quote so exported names/notes can never execute on open.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

/** Minor units → plain decimal string, e.g. 129950 → "1299.50". */
export function csvMoney(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

/** "orders" → "beyond-demands-orders-2026-07-21.csv" */
export function csvFilename(dataset: string, at: Date = new Date()): string {
  return `beyond-demands-${dataset}-${at.toISOString().slice(0, 10)}.csv`;
}

export function csvResponse(dataset: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(dataset)}"`,
      "Cache-Control": "no-store",
    },
  });
}
