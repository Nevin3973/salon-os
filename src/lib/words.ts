/**
 * Amounts spelled out for a tax invoice.
 *
 * Indian invoices carry the amount in words, and Tally prints it in the Indian
 * numbering system — lakh and crore, not million — so "Five Thousand Seven
 * Hundred Eighty Five" and, for the tax line, "Eight Hundred Eighty Two and
 * Forty Eight paise". Both forms are reproduced here because the printed
 * document is compared against Tally's by the client's accountant.
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

/** 0–999. */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h ? `${ONES[h]} Hundred` : "";
  const tail = rest ? twoDigits(rest) : "";
  return head && tail ? `${head} ${tail}` : head || tail;
}

/**
 * A whole number in the Indian system: crore, lakh, thousand, then hundreds.
 *
 * The grouping is 2-2-3 above the last three digits, not 3-3-3 — that is the
 * whole difference from the Western system and the reason this cannot be a
 * generic implementation.
 */
export function numberToIndianWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;
  // Crores above 99 keep recursing, so 1,00,00,00,000 still reads correctly.
  if (crore) parts.push(`${crore > 99 ? numberToIndianWords(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/**
 * Money in words, the way Tally prints it on an invoice.
 *
 * Whole rupees end "Only"; anything with paise names them before it, e.g.
 * "INR Eight Hundred Eighty Two and Forty Eight paise Only".
 */
export function amountInWords(minorUnits: number, currency = "INR"): string {
  const negative = minorUnits < 0;
  const abs = Math.abs(Math.round(minorUnits));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;

  const head = `${currency} ${numberToIndianWords(rupees)}`;
  const body = paise > 0 ? `${head} and ${twoDigits(paise)} paise` : head;
  return `${negative ? "Minus " : ""}${body} Only`;
}
