import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

/**
 * The matching rules a typed authorization code has to satisfy, pinned here
 * after a live failure: managers were being told a correct code was invalid.
 *
 * `verifyAuthCode` itself needs a database, so these cover the two pure rules
 * that broke — how a typed string is normalised before comparison, and which
 * codes are in scope for a given branch and person.
 */

/** Mirrors the normalisation in verifyAuthCode. */
function candidatesFor(typed: string): string[] {
  const t = typed.trim();
  return t === t.toUpperCase() ? [t] : [t, t.toUpperCase()];
}

async function matches(typed: string, hash: string): Promise<boolean> {
  for (const c of candidatesFor(typed)) {
    if (await bcrypt.compare(c, hash)) return true;
  }
  return false;
}

describe("typed code normalisation", () => {
  it("accepts the code typed in lower case", async () => {
    // Codes are issued upper case; a phone keyboard often is not.
    const hash = await bcrypt.hash("EDAP-4821", 10);
    expect(await matches("edap-4821", hash)).toBe(true);
  });

  it("accepts mixed case and surrounding whitespace", async () => {
    const hash = await bcrypt.hash("SOBH-1207", 10);
    expect(await matches("  Sobh-1207 ", hash)).toBe(true);
  });

  it("still rejects a genuinely wrong code", async () => {
    const hash = await bcrypt.hash("EDAP-4821", 10);
    expect(await matches("EDAP-4822", hash)).toBe(false);
    expect(await matches("", hash)).toBe(false);
  });
});

/** Mirrors the scope filter verifyAuthCode builds. */
function inScope(
  code: { locationId: string | null; userId: string | null },
  ctx: { branchId: string; userId: string }
): boolean {
  const branchOk = code.locationId === null || code.locationId === ctx.branchId;
  const userOk = code.userId === null || code.userId === ctx.userId;
  return branchOk && userOk;
}

describe("code scope", () => {
  const ctx = { branchId: "thrissur", userId: "u1" };

  it("accepts an org-wide code at any branch", () => {
    expect(inScope({ locationId: null, userId: null }, ctx)).toBe(true);
  });

  it("rejects a code issued to a different branch", () => {
    // The regression: the admin form defaulted to the first branch, so codes
    // handed round the business worked at exactly one of them.
    expect(inScope({ locationId: "edappal", userId: null }, ctx)).toBe(false);
  });

  it("accepts this branch's own shared code", () => {
    expect(inScope({ locationId: "thrissur", userId: null }, ctx)).toBe(true);
  });

  it("accepts a personal code only for its owner", () => {
    expect(inScope({ locationId: "thrissur", userId: "u1" }, ctx)).toBe(true);
    expect(inScope({ locationId: "thrissur", userId: "u2" }, ctx)).toBe(false);
  });
});
