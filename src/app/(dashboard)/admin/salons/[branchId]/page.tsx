import Link from "next/link";
import { notFound } from "next/navigation";
import { requireScopedSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/money";
import { fmtDateTime, orderCode, statusLabel } from "@/lib/format";
import { salesSummary, lastMonths } from "@/lib/reports";
import { PageHeader, StatGrid } from "@/components/console-ui";
import { TeamPanel, type TeamMember } from "./team-panel";

/**
 * One salon, end to end: what it sold, who sold it, what it is waiting on, and
 * what was changed by hand.
 *
 * The last of those is the point. Sales and stock figures are easy; the
 * question an owner cannot otherwise answer is who voided a bill or corrected
 * a shelf count, and when. Those entries are pulled out here rather than left
 * in the group-wide audit log, where they are true but unfindable.
 */
export default async function SalonPanelPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const { session, db } = await requireScopedSession("SUPER_ADMIN");

  const branch = await db.location.findFirst({ where: { id: branchId, type: "BRANCH" } });
  if (!branch) notFound();

  const { from, to } = lastMonths(1);
  const [summary, staff, openOrders, shelf, audit] = await Promise.all([
    salesSummary({ orgId: session.orgId, branchId }, { from, to }),
    db.staff.findMany({
      where: { OR: [{ branchId }, { branchId: null }] },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.order.findMany({
      where: { branchId, status: { in: ["PENDING", "PROCESSING", "PARTIALLY_FULFILLED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.branchStock.findMany({ where: { branchId }, include: { product: true } }),
    // The hand-made changes, which is where accountability actually lives.
    db.auditLogEntry.findMany({
      where: { action: { contains: "shelf" } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const retail = shelf.filter((s) => s.kind === "RETAIL");
  const salonUse = shelf.filter((s) => s.kind === "SALON_USE");
  const shelfValue = retail.reduce((n, s) => n + s.onHand * s.product.retailPriceCents, 0);
  const lowLines = retail.filter((s) => s.onHand > 0 && s.onHand <= 3).length;
  const outLines = retail.filter((s) => s.onHand === 0).length;

  // Sales credited to each person, matched onto the roster by id.
  const soldBy = new Map(summary.staff.map((s) => [s.staffId, s]));
  const members: TeamMember[] = staff.map((m) => ({
    id: m.id,
    name: m.name,
    title: m.title,
    isActive: m.isActive,
    branchId: m.branchId,
    bills: soldBy.get(m.id)?.bills ?? 0,
    revenueCents: soldBy.get(m.id)?.revenueCents ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title={branch.name}
        subtitle="Last 30 days. Everything this salon sold, holds and is waiting on."
      />
      <Link href="/admin/salons" className="text-xs text-muted hover:text-velvet">
        ← All salons
      </Link>

      <StatGrid
        stats={[
          { label: "Revenue", value: formatMoney(summary.totals.grossCents) },
          { label: "Bills", value: String(summary.totals.bills) },
          { label: "Shelf value", value: formatMoney(shelfValue) },
          { label: "Open orders", value: String(openOrders.length) },
          { label: "Low / out", value: `${lowLines} / ${outLines}` },
        ]}
      />

      <TeamPanel branchId={branch.id} members={members} />

      <Section
        title="Waiting on the warehouse"
        blurb="Orders this salon has placed that are not finished."
      >
        {openOrders.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {openOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="font-medium text-sm">{orderCode(o.orderNo)}</span>
                <span className="text-xs text-muted">{fmtDateTime(o.createdAt)}</span>
                <span className="text-xs text-velvet font-semibold">{statusLabel(o.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Best sellers here"
        blurb="What this salon's customers actually buy, netted for returns."
      >
        {summary.topProducts.length === 0 ? (
          <Empty>No counter sales in this window.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {summary.topProducts.slice(0, 8).map((p) => (
              <li key={p.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm min-w-0 truncate">{p.name}</span>
                <span className="text-xs text-faint tabular-nums shrink-0">
                  {p.units} · {formatMoney(p.revenueCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Stock changed by hand"
        blurb="Counts corrected outside a sale or a delivery — who, what and when."
      >
        {audit.length === 0 ? (
          <Empty>No manual corrections recorded.</Empty>
        ) : (
          <ul className="divide-y divide-line-soft">
            {audit.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="text-sm">{a.action}</div>
                <div className="text-xs text-faint mt-0.5">
                  {a.userName} · {fmtDateTime(a.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-xs text-faint mt-8">
        Holding {retail.length} sellable lines and {salonUse.length} salon-use lines.
      </p>
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-muted text-xs mt-0.5">{blurb}</p>
      <div className="bg-surface border border-line rounded-xl overflow-hidden mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-sm text-muted">{children}</div>;
}
