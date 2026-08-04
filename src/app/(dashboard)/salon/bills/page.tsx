import Link from "next/link";
import { requireScopedSession } from "@/lib/tenant";
import { fmtDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PAYMENT_MODE_LABEL, type PaymentModeValue } from "@/lib/constants";
import { ExportButton } from "@/components/console-ui";

export default async function BillsPage() {
  const { session, db } = await requireScopedSession(["PURCHASE_MANAGER", "SALON_STAFF"]);
  const branchId = session.locationId ?? undefined;
  const isManager = session.role === "PURCHASE_MANAGER";

  const sales = branchId
    ? await db.sale.findMany({
        // A cashier only sees the bills they raised; a manager sees the branch.
        where: { branchId, ...(isManager ? {} : { soldByUserId: session.userId }) },
        include: { items: { select: { qty: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Bills</h1>
          <p className="text-muted text-sm mt-1">
            {isManager ? "Every sale raised at this branch, newest first." : "Bills you’ve raised, newest first."}
          </p>
        </div>
        <div className="flex gap-2">
          {isManager && <ExportButton href="/api/exports/sales" label="Export CSV" />}
          <Link
            href="/salon/sell"
            className="inline-flex items-center h-9 px-4 rounded-lg bg-velvet text-on-velvet text-xs font-semibold hover:bg-velvet-dark transition-colors"
          >
            New sale
          </Link>
        </div>
      </div>

      {sales.length === 0 ? (
        <p className="text-muted mt-10 text-center">No bills yet. Raise one from the Sell screen.</p>
      ) : (
        <div className="space-y-2.5 mt-5">
          {sales.map((s) => {
            const units = s.items.reduce((n, it) => n + it.qty, 0);
            const void_ = s.status === "VOID";
            const badge =
              s.status === "VOID"
                ? { label: "Void", cls: "text-out bg-out-soft" }
                : s.status === "RETURNED"
                  ? { label: "Returned", cls: "text-out bg-out-soft" }
                  : s.status === "PARTIALLY_RETURNED"
                    ? { label: "Part returned", cls: "text-low bg-low-soft" }
                    : null;
            return (
              <Link
                key={s.id}
                href={`/salon/bills/${s.id}`}
                className="flex items-center gap-3 bg-surface border border-line rounded-xl p-4 hover:border-velvet/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.invoiceCode}</span>
                    {badge && (
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-faint mt-0.5">
                    {fmtDateTime(s.createdAt)} · {units} unit{units === 1 ? "" : "s"} ·{" "}
                    {PAYMENT_MODE_LABEL[s.paymentMode as PaymentModeValue]}
                    {s.customerName ? ` · ${s.customerName}` : ""}
                  </div>
                </div>
                <span className={`ml-auto font-semibold tabular-nums ${void_ ? "line-through text-faint" : ""}`}>
                  {formatMoney(s.totalCents)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
