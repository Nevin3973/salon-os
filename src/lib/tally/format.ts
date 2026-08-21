/// Conversions across the Tally boundary, in one place.
///
/// Three date formats are in play — Salon OS stores UTC instants, the
/// connector's request sample uses `1-3-2025`, its response sample uses
/// `01/Dec/2025`, and Tally's own native format is `YYYYMMDD`. Keeping every
/// conversion here means a change to the agreed contract is a change to one
/// file, not a hunt through the emit paths.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/// IST is UTC+5:30 and never observes DST, so a fixed offset is exact.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/// Accepts "2025-12-01" or "01/Dec/2025" and returns the instant that IST day
/// begins — or, with `endOfDay`, the instant the next one does.
///
/// Ambiguous input like "1-3-2025" is REJECTED rather than guessed. A silent
/// day/month swap moves entries across a GST period, which is the kind of
/// error nobody finds until a return has already been filed.
export function parseIstDate(raw: unknown, endOfDay = false): Date | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();

  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const tally = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/.exec(s);

  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]) - 1;
    d = Number(iso[3]);
  } else if (tally) {
    d = Number(tally[1]);
    m = MONTHS.findIndex((x) => x.toLowerCase() === tally[2].toLowerCase());
    y = Number(tally[3]);
    if (m < 0) return null;
  } else {
    return null;
  }

  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const at = new Date(Date.UTC(y, m, d + (endOfDay ? 1 : 0)) - IST_OFFSET_MS);
  return Number.isNaN(at.getTime()) ? null : at;
}

/// Tally's display format, e.g. "01/Dec/2025", rendered in IST.
export function toTallyDate(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  return `${dd}/${MONTHS[ist.getUTCMonth()]}/${ist.getUTCFullYear()}`;
}

/// Integer paise to the 4dp decimal string the connector expects.
///
/// Deliberately a STRING: letting a float cross the boundary invites the other
/// side to re-round it, and a half-paise drift per line becomes a rupee across
/// a day's billing — enough to make a reconciliation fail for no visible cause.
export function amt(cents: number): string {
  return (cents / 100).toFixed(4);
}

/// Whole-percent GST rate to the decimal form used in the payload.
export function rate(wholePercent: number): string {
  return wholePercent.toFixed(4);
}
