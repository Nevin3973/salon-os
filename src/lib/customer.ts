/**
 * Customer identity for the retail counter.
 *
 * Phone is the key. It is the one thing a walk-in reliably gives you, and it is
 * how a cashier will search — nobody spells a name the same way twice.
 */

/**
 * Reduces a typed phone number to comparable digits.
 *
 * Cashiers type `+91 98765 43210`, `098765 43210`, `98765-43210` and mean the
 * same person. Without normalising, the same customer accumulates three records
 * and their history is split across all of them — which defeats the point of
 * keeping history at all.
 *
 * Indian mobile numbers are ten digits; a leading 91 country code or a single
 * leading 0 is stripped so those forms collapse onto the same key. Anything
 * that is not a recognisable Indian mobile is left as its digits, so unusual
 * numbers still store and match consistently rather than being rejected.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, "");

  // A prefix is only stripped when what remains is a real mobile. Stripping
  // unconditionally corrupts landlines: `044 2833 1234` is eleven digits
  // starting with a zero, so a blind rule turns a Chennai number into a
  // different number entirely.
  if (digits.length === 12 && digits.startsWith("91") && MOBILE.test(digits.slice(2))) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0") && MOBILE.test(digits.slice(1))) {
    return digits.slice(1);
  }
  return digits;
}

/** Ten digits, starting 6–9 — the range India actually issues. */
const MOBILE = /^[6-9]\d{9}$/;

export function isPlausibleIndianMobile(phone: string): boolean {
  return MOBILE.test(normalisePhone(phone));
}

/** `98765 43210` — easier to read back to a customer than an unbroken run. */
export function formatPhone(phone: string): string {
  const d = normalisePhone(phone);
  return MOBILE.test(d) ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}
