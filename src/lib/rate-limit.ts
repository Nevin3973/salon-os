/**
 * In-memory sliding-window rate limiter.
 *
 * Suits a single-instance deployment (and dev). When the app scales to
 * multiple instances, swap the store for Redis behind the same interface —
 * callers don't change. Fails closed per key: when the limit is hit, callers
 * get a retry-after and must reject the attempt.
 */

type Bucket = { timestamps: number[] };

const store = new Map<string, Bucket>();

// Periodic sweep so long-running processes don't accumulate dead keys.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export function takeToken(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();

  if (now - lastSweep > SWEEP_EVERY_MS) {
    lastSweep = now;
    for (const [k, b] of store) {
      if (b.timestamps.every((t) => now - t > windowMs)) store.delete(k);
    }
  }

  const bucket = store.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = Math.min(...bucket.timestamps);
    store.set(key, bucket);
    return { ok: false, retryAfterSec: Math.ceil((oldest + windowMs - now) / 1000) };
  }

  bucket.timestamps.push(now);
  store.set(key, bucket);
  return { ok: true };
}

/** Clears a key after a successful attempt so honest users aren't penalized. */
export function resetTokens(key: string) {
  store.delete(key);
}
