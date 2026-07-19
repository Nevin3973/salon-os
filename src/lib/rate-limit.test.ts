import { describe, it, expect } from "vitest";
import { takeToken, resetTokens } from "./rate-limit";

describe("takeToken", () => {
  it("allows up to the limit, then blocks with a retry hint", () => {
    const key = `t1-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(takeToken(key, { limit: 5, windowMs: 60_000 }).ok).toBe(true);
    }
    const blocked = takeToken(key, { limit: 5, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("keys are independent", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) takeToken(a, { limit: 3, windowMs: 60_000 });
    expect(takeToken(a, { limit: 3, windowMs: 60_000 }).ok).toBe(false);
    expect(takeToken(b, { limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });

  it("resetTokens clears the counter (successful login case)", () => {
    const key = `r-${Math.random()}`;
    for (let i = 0; i < 3; i++) takeToken(key, { limit: 3, windowMs: 60_000 });
    expect(takeToken(key, { limit: 3, windowMs: 60_000 }).ok).toBe(false);
    resetTokens(key);
    expect(takeToken(key, { limit: 3, windowMs: 60_000 }).ok).toBe(true);
  });
});
