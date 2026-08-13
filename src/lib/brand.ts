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

/** The parent business. Co-branded into the product lockup itself, so the
 *  relationship is stated wherever the product is named rather than tucked
 *  into a footnote. */
export const PARENT_NAME = "Infynix Solutions";

/** Marketing/site domain. */
export const VENDOR_DOMAIN = "beyonddemands.in";

/**
 * The half-line that follows the wordmark. Kept separate from the wordmark so
 * a two-line lockup (mark above, this below) and a one-line lockup can share
 * the same words and never drift apart.
 */
export const PRODUCT_TAGLINE = `an ${PARENT_NAME} product`;

/** One-line lockup for anywhere a stacked mark will not fit. */
export const PRODUCT_LOCKUP = `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`;

/** Long form for document footers, e.g. the printed invoice and email. */
export const POWERED_BY = PRODUCT_LOCKUP;

/** Attribution shown under the wordmark on sign-in and in the app shell. */
export const ATTRIBUTION = PRODUCT_TAGLINE;

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
