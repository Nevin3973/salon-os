/**
 * Who may see the technical status page.
 *
 * This is a maintenance surface, not a business one. A salon owner does not
 * need to know which rate-limiter backend is in use, and showing them makes
 * the product feel like plumbing; worse, half of it reads as broken when it is
 * simply "not configured on purpose".
 *
 * Deliberately an allowlist on top of the ordinary login rather than a second
 * set of credentials. A separate login means another password store, another
 * reset flow and another thing to leak — all to protect a page that reports
 * booleans. Gating the accounts that already exist is both stronger and less
 * to maintain.
 *
 * Set DEVELOPER_EMAILS to a comma-separated list. Unset means nobody, not
 * everybody: an unconfigured allowlist must never open the page up, because
 * that is precisely the state a fresh deployment is in.
 */
export function developerEmails(): string[] {
  return (process.env.DEVELOPER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isDeveloper(email: string | null | undefined): boolean {
  if (!email) return false;
  return developerEmails().includes(email.toLowerCase());
}
