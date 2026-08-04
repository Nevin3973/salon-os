import { prisma } from "@/lib/db";
import { limiterBackend } from "@/lib/rate-limit";
import { observabilityEnabled } from "@/lib/observability";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Deployment health and readiness.
 *
 * Beyond "is it up", this answers the questions that are easy to get wrong and
 * invisible until they bite: is the rate limiter actually shared, is error
 * reporting on, is email configured, is the database reachable. Point an uptime
 * monitor at it and you'll know within a minute if production is degraded.
 *
 * It reports posture, never secrets — booleans and backend names only.
 */
export const dynamic = "force-dynamic";

/**
 * Briefly cached, because this endpoint is public by necessity (an uptime
 * monitor cannot authenticate) and every call otherwise costs a database round
 * trip — which makes it a free way to exhaust the connection pool. Five seconds
 * is well inside any monitor's interval and blunts a flood.
 */
const CACHE_MS = 5000;
let cached: { at: number; body: unknown; status: number } | null = null;

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return Response.json(cached.body, {
      status: cached.status,
      headers: { "Cache-Control": "no-store", "X-Cache": "hit" },
    });
  }

  const checks: Record<string, unknown> = {};
  let healthy = true;

  // Database — the only hard dependency.
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - started };
  } catch {
    healthy = false;
    checks.database = { ok: false, error: "unreachable" };
  }

  // Shared rate limiting. On more than one instance an in-memory limiter is
  // effectively no limiter, so surface it as a warning rather than a pass.
  const backend = limiterBackend();
  checks.rateLimiter = {
    backend,
    shared: backend === "upstash",
    ...(backend === "memory"
      ? { warning: "In-memory: brute-force limits do not hold across instances." }
      : {}),
  };

  // "configured", not "enabled": all this can tell you is that a DSN is set and
  // reports have somewhere to go. Whether any code path actually calls
  // reportError is a property of the code, not of the environment, and claiming
  // otherwise would turn this endpoint into false reassurance.
  checks.errorReporting = { configured: observabilityEnabled() };
  checks.email = {
    configured: Boolean(process.env.RESEND_API_KEY),
    // The shared Resend sender only delivers to the account owner's address.
    usingSharedSender: (process.env.EMAIL_FROM ?? "").includes("onboarding@resend.dev"),
  };

  const body = {
    service: PRODUCT_NAME,
    status: healthy ? "ok" : "degraded",
    environment: process.env.NODE_ENV ?? "development",
    checks,
  };
  const status = healthy ? 200 : 503;
  cached = { at: Date.now(), body, status };

  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Cache": "miss" },
  });
}
