import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashApiKey, resolveOrgContext, type OrgContext } from "./auth";

/// Authentication for the Tally connector.
///
/// The rest of the REST surface takes `Authorization: Bearer vlvt_…`, which is
/// the right place for a credential: headers stay out of request bodies, out of
/// application logs, and out of anything that gets echoed back on error.
///
/// The connector, though, sends its credentials in the JSON body — that is the
/// shape the partner demonstrated and the shape their existing integrations
/// use. Refusing it would mean asking them to rewrite a working client for our
/// convenience, so both are accepted here. The verification is identical: the
/// same SHA-256 comparison against the same stored hash. Only the transport
/// differs.
///
/// `id` and `password` in the connector's payload are not checked. The API key
/// is the credential; treating a second pair of unsalted secrets as meaningful
/// would imply a guarantee this route does not make.

export async function resolveTallyContext(
  req: NextRequest,
  body: Record<string, unknown>,
): Promise<OrgContext | null> {
  // Header first — if the connector can be configured to send one, that path
  // is preferred and nothing else needs to change.
  const viaHeader = await resolveOrgContext(req);
  if (viaHeader) return viaHeader;

  const raw = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!raw.startsWith("vlvt_")) return null;

  const prefix = raw.slice(0, 13);
  const key = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!key || key.revokedAt || key.keyHash !== hashApiKey(raw)) return null;

  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { orgId: key.orgId, role: null, locationId: null, actor: `tally:${key.name}` };
}
