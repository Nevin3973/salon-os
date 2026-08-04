/**
 * Sliding-window rate limiter for brute-force protection (sign-in, purchase
 * codes, till unlock).
 *
 * Backed by Upstash Redis when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set, and by an in-process Map otherwise.
 *
 * The distinction matters: on serverless every instance gets its own memory, so
 * an in-memory limit is really "N attempts per instance" and an attacker
 * spraying requests lands on fresh instances. It looks protected and isn't.
 * A shared store is what makes the limit real, which is why `limiterBackend()`
 * is surfaced — the deploy checklist asserts it says "upstash" in production.
 *
 * Redis is reached over its REST API with plain fetch, so there is no extra
 * dependency and it works on edge runtimes. If Redis is unreachable the call
 * falls back to the local Map rather than throwing: a degraded limit is far
 * better than a sign-in page that refuses everyone.
 */

type Bucket = { timestamps: number[] };

const store = new Map<string, Bucket>();

// Periodic sweep so long-running processes don't accumulate dead keys.
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Which store is actually in use — asserted by the deploy checklist. */
export function limiterBackend(): "upstash" | "memory" {
  return REDIS_URL && REDIS_TOKEN ? "upstash" : "memory";
}

/** In-process fallback. Correct on one instance; per-instance on many. */
function takeTokenLocal(
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

/** Runs a batch of Redis commands in one REST round trip. */
async function redisPipeline(commands: (string | number)[][]): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown; error?: string }[];
    return json.map((r) => r.result);
  } catch {
    return null; // network trouble — caller degrades to the local limiter
  }
}

/**
 * Records an attempt against `key`. Returns `ok: false` with a retry hint once
 * `limit` attempts have happened inside `windowMs`.
 *
 * The window is a Redis sorted set keyed by timestamp: expired entries are
 * trimmed, the remainder counted, and the attempt appended — all in one
 * pipelined round trip.
 */
export async function takeToken(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  if (limiterBackend() === "memory") return takeTokenLocal(key, { limit, windowMs });

  const now = Date.now();
  const redisKey = `rl:${key}`;
  // Unique per attempt: two requests in the same millisecond must not collapse
  // into one sorted-set member.
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

  const results = await redisPipeline([
    ["ZREMRANGEBYSCORE", redisKey, 0, now - windowMs],
    ["ZCARD", redisKey],
    ["ZADD", redisKey, now, member],
    ["PEXPIRE", redisKey, windowMs],
  ]);
  if (!results) return takeTokenLocal(key, { limit, windowMs });

  const countBefore = Number(results[1] ?? 0);
  if (countBefore >= limit) {
    // The attempt above was recorded optimistically to keep the common
    // (allowed) case to a single round trip. Over the limit we must take it
    // back out: if rejected attempts stayed in the window, every retry would
    // push the expiry further away and a user who mistyped their password
    // could never wait out their own lockout. takeTokenLocal never records an
    // over-limit attempt, and these two backends have to agree — the whole
    // point of the fallback is that behaviour does not change with the store.
    const undo = await redisPipeline([
      ["ZREM", redisKey, member],
      ["ZRANGE", redisKey, 0, 0, "WITHSCORES"],
    ]);
    const oldestScore = Number((undo?.[1] as string[] | undefined)?.[1] ?? now);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000)),
    };
  }
  return { ok: true };
}

/** Clears a key after a successful attempt so honest users aren't penalized. */
export async function resetTokens(key: string): Promise<void> {
  store.delete(key);
  if (limiterBackend() === "upstash") {
    await redisPipeline([["DEL", `rl:${key}`]]);
  }
}
