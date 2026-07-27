import bcrypt from "bcryptjs";
import { withOrg } from "@/lib/tenant";
import { takeToken, resetTokens } from "@/lib/rate-limit";

/**
 * Verifies a branch/org authorization code — the manager-approval gate.
 *
 * It backs three things: placing/editing a purchase order (buying supplies),
 * and — as a segregation-of-duties control — voiding a customer bill or
 * adjusting shelf stock by hand. Those two reverse money or mask shrinkage, so
 * even a manager must present the code to do them.
 *
 * Returns the matched code's id, or a message to show the user. Rate-limited
 * per user (10 tries / 10 min) so codes can't be brute-forced.
 */
export async function verifyAuthCode(
  session: { userId: string; orgId: string },
  branchId: string,
  rawCode: string
): Promise<{ ok: true; codeId: string } | { ok: false; error: string }> {
  const limiter = takeToken(`authcode:${session.userId}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limiter.ok) {
    return {
      ok: false,
      error: `Too many tries. Wait about ${Math.max(1, Math.ceil(limiter.retryAfterSec / 60))} minute(s) and try again.`,
    };
  }

  const codes = await withOrg(session.orgId, (tx) =>
    tx.authorizationCode.findMany({
      where: {
        orgId: session.orgId,
        isActive: true,
        OR: [{ locationId: null }, { locationId: branchId }],
      },
    })
  );
  for (const c of codes) {
    if (await bcrypt.compare(rawCode.trim(), c.codeHash)) {
      resetTokens(`authcode:${session.userId}`);
      return { ok: true, codeId: c.id };
    }
  }
  return { ok: false, error: "That authorization code is not valid." };
}
