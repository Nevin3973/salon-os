import { requireScopedSession } from "@/lib/tenant";
import { expiryBuckets, SHORT_DATED_DAYS } from "@/lib/expiry";
import { ExpiryBoard } from "@/components/expiry-board";
import { RecordBatchForm } from "@/components/record-batch-form";

/// Expiring stock across every location.
///
/// The warehouse sees all of it — its own shelves and every salon's — because
/// short-dated stock at one branch is often best solved by moving it to a
/// busier one, and that is a decision only the centre can see well enough to
/// make.

export default async function WarehouseExpiryPage() {
  const { db } = await requireScopedSession("WAREHOUSE_MANAGER");
  const buckets = await expiryBuckets(db);

  const [products, branches] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      select: { id: true, name: true, sku: true },
      orderBy: { name: "asc" },
    }),
    db.location.findMany({
      where: { type: "BRANCH", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const total = buckets.expired.length + buckets.shortDated.length + buckets.quarantined.length;

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Expiry</h1>
      <p className="text-muted text-sm mb-6">
        Dated stock across the warehouse and every salon. Short-dated means expiring within{" "}
        {SHORT_DATED_DAYS} days — still sellable, and still worth moving.
      </p>

      <RecordBatchForm products={products} locations={branches} />

      {total === 0 ? (
        <p className="text-muted text-sm">
          Nothing is expired, short-dated or quarantined. Batches appear here once they are
          recorded against a product.
        </p>
      ) : null}

      <ExpiryBoard
        tone="danger"
        title="Expired"
        blurb="Past its date and still counted in stock. Writing it off removes it from the ledger and books the loss to Tally."
        rows={buckets.expired}
        actions={["quarantine", "writeOff"]}
        showLocation
      />

      <ExpiryBoard
        tone="warn"
        title="Short-dated"
        blurb="Still sellable. Move it where it will sell before the date rather than waiting for it to become a write-off."
        rows={buckets.shortDated}
        actions={["quarantine"]}
        showLocation
      />

      <ExpiryBoard
        title="Quarantined"
        blurb="Pulled from sale and awaiting disposal. Already excluded from the lists above, so nothing is counted twice."
        rows={buckets.quarantined}
        actions={["writeOff"]}
        showLocation
      />
    </div>
  );
}
