/**
 * Reads Tally's Stock Summary — the client's own product master.
 *
 * Tally holds this as a two-level tree: stock GROUPS with stock ITEMS beneath
 * them. In the on-screen export the level is carried by cell indentation, which
 * does not survive a save to CSV, so the supported input carries the group as
 * its own column. In Tally that is Stock Summary → Export, with Stock Group
 * added as a column.
 *
 * The group name is load-bearing in this business. Atmosot names groups
 * "<BRAND> <CHANNEL>" — LOREAL RETAIL, LOREAL SALON, DAVINS RETAIL, DAVINS
 * SALOON — and that suffix is the accounting distinction the whole platform
 * turns on: a RETAIL line is sold to a customer at MRP, a SALON line is
 * consumed during a service at cost. So the suffix maps to `sellRetail` /
 * `salonUse` and the stem to the brand.
 *
 * Real data is not tidy. The live file contains "SALOON" and "SALON",
 * "KANPEKI  SALON" with two spaces, and "NAASHI SALOn" in mixed case. Matching
 * is therefore done on a normalised form, and anything that does not carry a
 * recognised suffix keeps the whole group name as its brand.
 */

/** How a line is used, which is what decides where it shows up in the app. */
export type Channel = "RETAIL" | "SALON";

export type TallyStockRow = {
  /** Stock group exactly as Tally spells it — kept verbatim so it round-trips. */
  group: string;
  /** Stock item name, Tally's only usable key in this export. */
  name: string;
  /** Closing quantity. Null when Tally reports a value with no quantity. */
  qty: number | null;
  /** Closing rate in minor units (paise). Null when Tally leaves it blank. */
  rateCents: number | null;
  /** Closing value in minor units. */
  valueCents: number | null;
};

export type MappedProduct = {
  group: string;
  name: string;
  brand: string;
  category: string;
  channel: Channel;
  qty: number;
  priceCents: number;
};

/** Suffixes seen in the live file, longest first so "SALOON" wins over "SALON". */
const CHANNEL_SUFFIXES: { suffix: string; channel: Channel }[] = [
  { suffix: "SALOON", channel: "SALON" },
  { suffix: "SALON", channel: "SALON" },
  { suffix: "RETAIL", channel: "RETAIL" },
];

/** Upper-cased, punctuation-stripped, single-spaced — for matching only. */
function normalise(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Splits a group name into its brand and how the line is used.
 *
 * A group with no recognised suffix keeps its full name as the brand and is
 * treated as SALON. That is the safe default, not a guess: an unrecognised
 * group defaulting to RETAIL would put an untested item on the till, where a
 * cashier could sell a back-bar chemical to a customer.
 */
export function splitGroup(group: string): { brand: string; channel: Channel } {
  const n = normalise(group);
  for (const { suffix, channel } of CHANNEL_SUFFIXES) {
    if (n === suffix) return { brand: n, channel };
    if (n.endsWith(` ${suffix}`)) {
      return { brand: n.slice(0, -(suffix.length + 1)).trim(), channel };
    }
  }
  return { brand: n, channel: "SALON" };
}

/** Parses "1,234.56" / "" / "(2)" into minor units. Null when there is nothing. */
export function parseAmountCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  const t = raw.trim();
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t);
  const cleaned = t.replace(/[(),\s]/g, "").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const v = Number(cleaned);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100) * (negative ? -1 : 1);
}

/**
 * Parses a quantity. Tally writes these with the unit attached ("92 Nos",
 * "2,883 pcs"), so the unit is stripped rather than allowed to poison the
 * number.
 */
export function parseQty(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : null;
  const t = raw.trim();
  if (!t) return null;
  const m = t.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? Math.trunc(v) : null;
}

/**
 * Turns parsed rows into what the product master needs.
 *
 * Rows Tally reports with a value but no quantity are kept, at qty 0: they are
 * real items whose stock has run out, and dropping them would quietly shorten
 * the catalogue. A row with neither a name nor a group is skipped.
 */
export function mapRows(rows: TallyStockRow[]): MappedProduct[] {
  const out: MappedProduct[] = [];
  for (const r of rows) {
    const name = r.name.trim();
    const group = r.group.trim();
    if (!name || !group) continue;
    const { brand, channel } = splitGroup(group);
    out.push({
      group,
      name,
      brand,
      category: group,
      channel,
      qty: Math.max(0, r.qty ?? 0),
      priceCents: Math.max(0, r.rateCents ?? 0),
    });
  }
  return out;
}

/**
 * A stable SKU for an item Tally has no code for.
 *
 * Tally's Stock Summary export carries no item code and no GUID, so the item
 * NAME is the only key available. That is a weak key — renaming an item in
 * Tally creates a second product here — which is exactly why `Product.tallyGuid`
 * exists and why the connector should populate it. Until it does, this keeps
 * repeat imports of the same file idempotent instead of duplicating 531 rows.
 */
export function skuFor(group: string, name: string): string {
  const key = `${normalise(group)}|${normalise(name)}`;
  // FNV-1a, 32-bit: short, stable across runs, and good enough to separate
  // a few thousand names.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const stem = normalise(name).replace(/ /g, "").slice(0, 8) || "ITEM";
  return `TLY-${stem}-${h.toString(36).toUpperCase().padStart(7, "0")}`;
}
