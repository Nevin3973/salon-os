import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { takeToken } from "@/lib/rate-limit";
import { hashApiKey, resolveOrgContext, safeEqualHex, type OrgContext } from "./auth";

/// Authentication for the Tally connector.
///
/// The rest of the REST surface takes `Authorization: Bearer vlvt_…`, which is
/// the right place for a credential: headers stay out of request bodies, out of
/// application logs, and out of anything echoed back on error.
///
/// The connector, though, sends its credentials in the JSON body — that is the
/// shape the partner demonstrated and the shape their existing integrations
/// use. Refusing it would mean asking them to rewrite a working client for our
/// convenience, so both are accepted. Verification is identical: the same
/// SHA-256 compared the same constant-time way. Only the transport differs.
///
/// The trade-off is real and worth writing down: a credential in a body is far
/// easier to leak into logs than one in a header. Anything that logs request
/// bodies — a proxy, an error reporter, a debug flag left on — captures this
/// key. If body logging is ever switched on anywhere in front of this app, the
/// connector's key must be rotated and moved to the header.
///
/// `id` and `password` in the connector's payload are deliberately NOT checked.
/// The API key is the credential. Validating a second pair of unsalted secrets
/// would imply a guarantee this route does not make, and quietly ignoring them
/// is better than pretending they are doing work.

/// Failed attempts per client per window. A bearer key has no lockout and no
/// second factor, so without this an attacker gets unlimited online guesses at
/// a credential that grants a whole org's ledger. Generous enough that a
/// misconfigured connector retrying does not lock itself out of a correct key —
/// successes are not counted.
const FAILED_ATTEMPT_LIMIT = 20;
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

export type TallyAuth = OrgContext | "RATE_LIMITED" | null;

/// Best-effort client identity for rate limiting. Behind a proxy the socket
/// address is the proxy, so the forwarded header is used when present. It is
/// spoofable, which is why the key prefix is also part of the bucket: a forged
/// header still cannot spread guesses against one key across many buckets.
function clientId(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function resolveTallyContext(
  req: NextRequest,
  body: Record<string, unknown>,
): Promise<TallyAuth> {
  // Header first — if the connector can be configured to send one, that path is
  // preferred and nothing else needs to change.
  const viaHeader = await resolveOrgContext(req);
  if (viaHeader) return viaHeader;

  const raw = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!raw.startsWith("vlvt_")) return null;

  const prefix = raw.slice(0, 13);
  const bucket = `tally:${clientId(req)}:${prefix}`;

  const allowed = await takeToken(bucket, {
    limit: FAILED_ATTEMPT_LIMIT,
    windowMs: FAILED_ATTEMPT_WINDOW_MS,
  });
  if (!allowed.ok) return "RATE_LIMITED";

  const key = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!key || key.revokedAt || !safeEqualHex(key.keyHash, hashApiKey(raw))) return null;

  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { orgId: key.orgId, role: null, locationId: null, actor: `tally:${key.name}` };
}
