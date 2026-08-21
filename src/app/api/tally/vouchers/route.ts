import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getScopedDb } from "@/lib/tenant";
import { resolveOrgContext, unauthorized } from "@/server/api/auth";
import { parseIstDate, toTallyDate } from "@/lib/tally/format";

/// Tally integration — outbound voucher feed.
///
/// The partner's connector runs on the client's LAN, polls this route for a
/// date range, and imports what it gets into Tally. We never call Tally: it
/// has no public address and cannot call out.
///
/// Served from TallyOutbox, not from a live query over Sale. The payload was
/// snapshotted when the event happened, so a re-pull of last month returns
/// exactly what it returned the first time even if the catalogue has since
/// changed. A live query cannot promise that.

/// Types the partner has confirmed they can import. Everything else is still
/// captured in the outbox — it just isn't served until the voucher mapping is
/// agreed, because emitting a shape they don't parse is worse than nothing.
const AGREED_TYPES = ["SALE"];

const KNOWN_TYPES = ["SALE", "SALE_RETURN", "VOID", "ALLOCATION", "BRANCH_RETURN", "WRITE_OFF"];

export async function POST(req: NextRequest) {
  const ctx = await resolveOrgContext(req);
  if (!ctx) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const from = parseIstDate(body.from_date);
  const to = parseIstDate(body.to_date, true);

  if (!from || !to) {
    return NextResponse.json(
      {
        error:
          "from_date and to_date are required, as YYYY-MM-DD or DD/Mon/YYYY (e.g. 2025-12-01 or 01/Dec/2025). Dates are read as IST.",
      },
      { status: 400 },
    );
  }
  if (to <= from) {
    return NextResponse.json({ error: "to_date must be on or after from_date." }, { status: 400 });
  }

  // Lets the connector opt into types as they are agreed, without a deploy.
  const requested = Array.isArray(body.types)
    ? body.types.filter((t): t is string => typeof t === "string" && KNOWN_TYPES.includes(t))
    : AGREED_TYPES;
  const types = requested.length ? requested : AGREED_TYPES;

  const db = getScopedDb(ctx.orgId);

  const rows = await db.tallyOutbox.findMany({
    where: { occurredAt: { gte: from, lt: to }, eventType: { in: types } },
    orderBy: { occurredAt: "asc" },
    select: { externalRef: true, payload: true, occurredAt: true, syncedAt: true },
  });

  return NextResponse.json({
    FROM_DATE: toTallyDate(from),
    TO_DATE: toTallyDate(new Date(to.getTime() - 1)),
    COUNT: rows.length,
    TYPES_INCLUDED: types,
    /// Already acknowledged by a previous run. Re-served deliberately so an
    /// overlapping window is safe; de-duplicate on REF (pass it to Tally as
    /// REMOTEID) rather than assuming each event arrives once.
    PREVIOUSLY_SYNCED: rows.filter((r) => r.syncedAt).length,
    EVENTS: rows.map((r) => r.payload),
  });
}
