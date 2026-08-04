/**
 * Product identity in one place.
 *
 * The software is **Salon OS**; **Beyond Demands** is the company that makes it.
 * Everything customer-facing should say "Salon OS" and, where attribution
 * belongs (sign-in, invoice footer, email footer), add the vendor line. Import
 * from here rather than hard-coding strings, so a future rename is one edit.
 *
 * Not to be confused with the salon's OWN business name, which is per-tenant
 * (`Org.name` / `Org.legalName`) and is what a customer sees on their bill.
 */

/** The product. */
export const PRODUCT_NAME = "Salon OS";

/** The company behind it. */
export const VENDOR_NAME = "Beyond Demands";

/** Marketing/site domain. */
export const VENDOR_DOMAIN = "beyonddemands.in";

/** Shown under the logo on sign-in and in footers. */
export const VENDOR_LINE = `from ${VENDOR_NAME}`;

/** Long form for document footers, e.g. the printed invoice. */
export const POWERED_BY = `${PRODUCT_NAME} · ${VENDOR_NAME}`;

/**
 * The two halves of the wordmark, so the UI can colour the second one.
 * "Salon" + "OS".
 */
export const WORDMARK = { first: "Salon", second: "OS" } as const;

/** Browser tab / metadata title. */
export const APP_TITLE = `${PRODUCT_NAME} — salon supply & retail`;

/** Public origin, used in emails and absolute links. */
export function appUrl(): string {
  return process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
