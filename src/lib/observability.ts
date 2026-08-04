/**
 * Error reporting.
 *
 * Production currently has no way to tell you a cashier hit a failure at 7pm on
 * a Saturday. This gives every server action and route one place to report a
 * problem, and forwards to Sentry when `SENTRY_DSN` is set.
 *
 * Deliberately dependency-free: it posts to Sentry's HTTP "store" endpoint with
 * fetch rather than pulling in the SDK, so nothing is added to the bundle and
 * there is no build-time instrumentation to go wrong. Swap in @sentry/nextjs
 * later if you want tracing and source maps — the call sites won't change.
 *
 * Reporting never throws and never blocks: an outage in the error reporter must
 * not become an outage in the till.
 */

import { after } from "next/server";

const DSN = process.env.SENTRY_DSN;

type Parsed = { url: string; key: string };

/** Turns a DSN into the ingest URL + public key it encodes. */
function parseDsn(dsn: string): Parsed | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId || !u.username) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}/store/`,
      key: u.username,
    };
  } catch {
    return null;
  }
}

const target = DSN ? parseDsn(DSN) : null;

export function observabilityEnabled(): boolean {
  return target !== null;
}

export type ErrorContext = {
  /** Where it happened, e.g. "recordSale". */
  where: string;
  /** Non-identifying breadcrumbs — never put customer data or secrets here. */
  tags?: Record<string, string | undefined>;
};

/**
 * Records an error. Always logs to the server console (so it lands in the host's
 * logs regardless), and additionally ships to Sentry when configured.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Console first: this is what you have when nothing else is set up.
  console.error(`[${context.where}]`, message, context.tags ?? "");

  if (!target) return;

  const body = {
    message: `${context.where}: ${message}`,
    level: "error",
    platform: "javascript",
    timestamp: Date.now() / 1000,
    environment: process.env.NODE_ENV ?? "development",
    tags: { where: context.where, ...context.tags },
    exception: {
      values: [{ type: error instanceof Error ? error.name : "Error", value: message, stacktrace: undefined }],
    },
    extra: stack ? { stack } : undefined,
  };

  const send = fetch(target.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=salonos/1.0`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => {
    /* swallow — already logged to console above */
  });

  // The user must never wait on error reporting, but a bare fire-and-forget is
  // not enough on serverless: the function can be frozen the moment it returns
  // its response, killing the request in flight — so the reports you most want
  // are exactly the ones that never arrive. `after()` keeps the runtime alive
  // for it without blocking the response. It throws outside a request context
  // (scripts, tests), where a floating promise is fine.
  try {
    after(() => send);
  } catch {
    void send;
  }
}

/**
 * Wraps a server action so unexpected failures are reported rather than lost.
 * Expected, handled outcomes (a validation error, "not enough stock") should
 * still be returned as values — this is for the ones nobody planned for.
 */
export async function withReporting<T>(where: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    reportError(e, { where });
    throw e;
  }
}
