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
 * A code is accepted only if it is in scope for BOTH the branch and the person:
 * an org-wide or branch code any manager there may use, or a personal code
 * issued to this user. Someone else's personal code simply does not match.
 *
 * Returns the matched code's id, or a message to show the user. Rate-limited
 * per user (10 tries / 10 min) so codes can't be brute-forced.
 */
export async function verifyAuthCode(
  session: { userId: string; orgId: string },
  branchId: string,
  rawCode: string
): Promise<{ ok: true; codeId: string; personal: boolean } | { ok: false; error: string }> {
  const limiter = await takeToken(`authcode:${session.userId}`, { limit: 10, windowMs: 10 * 60 * 1000 });
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
        // Scope: org-wide, this branch's shared code, or a personal code — and
        // a personal code only ever belongs to the person presenting it. This
        // is the whole point of issuing them individually: a manager cannot
        // approve with a colleague's code, so the name on the audit entry is
        // the name of whoever actually authorised the action.
        AND: [
          { OR: [{ locationId: null }, { locationId: branchId }] },
          { OR: [{ userId: null }, { userId: session.userId }] },
        ],
      },
    })
  );
  // Codes are issued in upper case ("EDAP-4821"), and bcrypt compares exactly.
  // A manager typing it in lower case — or a phone keyboard declining to
  // capitalise — was being told the code is invalid when it is the right code.
  // The raw form is tried first so any code that ever contained lower case
  // still matches.
  const typed = rawCode.trim();
  const candidates = typed === typed.toUpperCase() ? [typed] : [typed, typed.toUpperCase()];

  for (const c of codes) {
    for (const candidate of candidates) {
      if (await bcrypt.compare(candidate, c.codeHash)) {
        await resetTokens(`authcode:${session.userId}`);
        return { ok: true, codeId: c.id, personal: c.userId !== null };
      }
    }
  }

  // Nothing matched. Say WHY, because the two causes need different actions
  // and "not valid" sent people hunting for a typo in a code that was correct.
  if (codes.length === 0) {
    const anyForOrg = await withOrg(session.orgId, (tx) =>
      tx.authorizationCode.count({ where: { orgId: session.orgId, isActive: true } })
    );
    return {
      ok: false,
      error:
        anyForOrg > 0
          ? "No authorization code has been issued for this branch. Ask the owner to make one for it."
          : "No authorization codes exist yet. Ask the owner to create one in Admin → Purchase codes.",
    };
  }
  return { ok: false, error: "That authorization code is not valid." };
}
