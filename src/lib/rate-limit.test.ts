import { describe, it, expect, vi, afterEach } from "vitest";
import { takeToken, resetTokens, limiterBackend } from "./rate-limit";

// These exercise the in-process fallback, which is what runs when no Upstash
// credentials are configured (dev and CI).

describe("takeToken", () => {
  it("allows up to the limit, then blocks with a retry hint", async () => {
    const key = `t1-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect((await takeToken(key, { limit: 5, windowMs: 60_000 })).ok).toBe(true);
    }
    const blocked = await takeToken(key, { limit: 5, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("keys are independent", async () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) await takeToken(a, { limit: 3, windowMs: 60_000 });
    expect((await takeToken(a, { limit: 3, windowMs: 60_000 })).ok).toBe(false);
    expect((await takeToken(b, { limit: 3, windowMs: 60_000 })).ok).toBe(true);
  });

  it("resetTokens clears the counter (successful login case)", async () => {
    const key = `r-${Math.random()}`;
    for (let i = 0; i < 3; i++) await takeToken(key, { limit: 3, windowMs: 60_000 });
    expect((await takeToken(key, { limit: 3, windowMs: 60_000 })).ok).toBe(false);
    await resetTokens(key);
    expect((await takeToken(key, { limit: 3, windowMs: 60_000 })).ok).toBe(true);
  });

  it("reports which store is in use, so a deploy can assert it is shared", () => {
    // No Upstash credentials in dev/CI, so this must report the fallback.
    expect(limiterBackend()).toBe("memory");
  });
});

/**
 * The Redis path with `fetch` stubbed.
 *
 * These exist because the tests above only ever exercised the in-process
 * fallback while production runs the Redis path — so the backend that actually
 * matters had no coverage at all, and the two silently drifted apart. Stubbing
 * `fetch` is enough to pin the command sequence, which is where the bug was.
 */
describe("takeToken (Redis path)", () => {
  const calls: (string | number)[][][] = [];

  /** Fresh module instance with credentials present and `fetch` intercepted. */
  async function loadWithRedis(zcard: number) {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
    calls.length = 0;

    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const commands = JSON.parse(init.body) as (string | number)[][];
      calls.push(commands);
      return {
        ok: true,
        json: async () =>
          commands.map((c) => {
            if (c[0] === "ZCARD") return { result: zcard };
            if (c[0] === "ZRANGE") return { result: ["member", String(Date.now())] };
            return { result: 1 };
          }),
      };
    });

    return import("./rate-limit");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses Redis when credentials are present", async () => {
    const m = await loadWithRedis(0);
    expect(m.limiterBackend()).toBe("upstash");
  });

  it("allows an under-limit attempt in a single round trip", async () => {
    const m = await loadWithRedis(0);
    const res = await m.takeToken("k", { limit: 5, windowMs: 60_000 });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(1); // the common path must not cost two trips
  });

  it("removes the attempt it recorded when over the limit", async () => {
    // The regression this pins: the attempt is ZADDed optimistically, so when
    // it turns out to be over the limit it MUST be taken back out. Leaving it
    // in meant every rejected retry pushed the lockout further away and a user
    // could never wait out their own mistyped password.
    const m = await loadWithRedis(5);
    const res = await m.takeToken("k", { limit: 5, windowMs: 60_000 });
    expect(res.ok).toBe(false);

    const added = calls[0].find((c) => c[0] === "ZADD");
    const removed = calls[1]?.find((c) => c[0] === "ZREM");
    expect(added).toBeDefined();
    expect(removed).toBeDefined();
    // Same member in, same member out — no residue in the window.
    expect(removed![2]).toBe(added![3]);
  });

  it("falls back to the local limiter when Redis is unreachable", async () => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://stub.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "stub-token");
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const m = await import("./rate-limit");
    // Degraded, but a sign-in page that refuses everyone would be worse.
    const res = await m.takeToken(`down-${Math.random()}`, { limit: 2, windowMs: 60_000 });
    expect(res.ok).toBe(true);
  });
});
