import { requireScopedSession } from "@/lib/tenant";
import { expiryBuckets, SHORT_DATED_DAYS } from "@/lib/expiry";
import { ExpiryBoard } from "@/components/expiry-board";

/// Expiring stock held by this branch.
///
/// A purchase manager can pull a lot from sale and send it back, but cannot
/// write it off: disposal is a financial entry that reaches Tally, so it stays
/// with the warehouse.

export default async function BranchExpiryPage() {
  const { session, db } = await requireScopedSession("PURCHASE_MANAGER");
  const branchId = session.locationId;

  const buckets = branchId
    ? await expiryBuckets(db, { branchId })
    : { expired: [], shortDated: [], quarantined: [] };

  const total = buckets.expired.length + buckets.shortDated.length + buckets.quarantined.length;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Expiring stock</h1>
      <p className="text-muted text-sm mb-6">
        Dated stock on your shelves. Short-dated means expiring within {SHORT_DATED_DAYS} days —
        worth pushing now rather than sending back later.
      </p>

      {!branchId ? (
        <p className="text-muted text-sm">Your account is not assigned to a branch.</p>
      ) : total === 0 ? (
        <p className="text-muted text-sm">
          Nothing on your shelves is expired, short-dated or pulled from sale.
        </p>
      ) : null}

      <ExpiryBoard
        tone="danger"
        title="Expired"
        blurb="Past its date. Pull it from sale, then send it back to the warehouse — the warehouse books the write-off."
        rows={buckets.expired}
        actions={["quarantine", "return"]}
        showLocation={false}
      />

      <ExpiryBoard
        tone="warn"
        title="Short-dated"
        blurb="Still sellable. Push it while it still has time on it."
        rows={buckets.shortDated}
        actions={["quarantine"]}
        showLocation={false}
      />

      <ExpiryBoard
        title="Pulled from sale"
        blurb="Held back and waiting to go to the warehouse."
        rows={buckets.quarantined}
        actions={["return"]}
        showLocation={false}
      />
    </div>
  );
}
