import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getScopedDb } from "@/lib/tenant";
import { resolveOrgContext, unauthorized } from "@/server/api/auth";

/// Tally integration — import acknowledgement.
///
/// Closes the loop the sample contract left open. Without it neither side can
/// show what actually landed in Tally, and a connector that silently stopped
/// looks identical to a quiet week of trading. With it, "rows unsynced and
/// older than a couple of hours" becomes a usable alert.

type AckItem = { REF?: unknown; VOUCHERNO?: unknown; ERROR?: unknown };

export async function POST(req: NextRequest) {
  const ctx = await resolveOrgContext(req);
  if (!ctx) return unauthorized();

  let body: { acks?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.acks)) {
    return NextResponse.json({ error: "Expected { acks: [ { REF, VOUCHERNO } ] }." }, { status: 400 });
  }

  const db = getScopedDb(ctx.orgId);
  const now = new Date();
  let applied = 0;
  const unknown: string[] = [];

  for (const raw of body.acks as AckItem[]) {
    const ref = typeof raw?.REF === "string" ? raw.REF : null;
    if (!ref) continue;

    const voucherNo = typeof raw.VOUCHERNO === "string" ? raw.VOUCHERNO : null;
    const error = typeof raw.ERROR === "string" && raw.ERROR ? raw.ERROR : null;

    const row = await db.tallyOutbox.findFirst({
      where: { externalRef: ref },
      select: { id: true, attempts: true },
    });
    if (!row) {
      unknown.push(ref);
      continue;
    }

    await db.tallyOutbox.update({
      where: { id: row.id },
      data: error
        // A reported failure records the reason and leaves syncedAt null, so
        // the row stays visible to the stalled-connector check.
        ? { attempts: row.attempts + 1, lastError: error }
        : { syncedAt: now, tallyVoucherNo: voucherNo, lastError: null },
    });
    applied += 1;
  }

  return NextResponse.json({ APPLIED: applied, UNKNOWN_REFS: unknown });
}
