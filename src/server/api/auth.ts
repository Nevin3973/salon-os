import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type OrgContext = {
  orgId: string;
  /** null for API keys (machine callers act org-wide) */
  role: "PURCHASE_MANAGER" | "WAREHOUSE_MANAGER" | "SUPER_ADMIN" | null;
  locationId: string | null;
  actor: string; // user name or API key name, for logs
};

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Resolves the calling org for a REST request: `Authorization: Bearer vlvt_…`
 * API key first, then the browser session. Returns null when unauthenticated.
 */
export async function resolveOrgContext(req: NextRequest): Promise<OrgContext | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer vlvt_")) {
    const raw = header.slice(7).trim();
    const prefix = raw.slice(0, 13); // "vlvt_" + 8 chars
    const key = await prisma.apiKey.findUnique({ where: { prefix } });
    if (!key || key.revokedAt || key.keyHash !== hashApiKey(raw)) return null;
    // Fire-and-forget usage stamp; not worth failing the request over.
    prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return { orgId: key.orgId, role: null, locationId: null, actor: `api:${key.name}` };
  }

  const session = await auth();
  if (session?.user && session.activeOrgId && session.activeRole) {
    return {
      orgId: session.activeOrgId,
      role: session.activeRole,
      locationId: session.activeLocationId,
      actor: session.user.name,
    };
  }
  return null;
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function unauthorized() {
  return apiError(401, "unauthorized", "Provide a valid session or API key.");
}
