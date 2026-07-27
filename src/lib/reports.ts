import type { OrderStatus } from "@prisma/client";
import { getScopedDb } from "@/lib/tenant";
import { reservedByProduct, availableOf, stockState } from "@/lib/stock";
import { orderCode, statusLabel } from "@/lib/format";
import { invoiceCode } from "@/lib/gst";
import { PAYMENT_MODE_LABEL, type PaymentModeValue } from "@/lib/constants";
import { toCsv, csvMoney, type CsvColumn } from "@/lib/csv";

/**
 * Reporting reads. Every query goes through `getScopedDb`, so the org filter
 * and the database's RLS policies both apply; `branchId` narrows further for a
 * Purchase Manager, who may only export their own branch's orders.
 */

export type ReportScope = {
  orgId: string;
  /** null = whole org (warehouse / admin); set = one branch (purchase manager) */
  branchId: string | null;
};

export type ReportRange = { from: Date | null; to: Date | null };

/** Parses yyyy-mm-dd bounds. `to` is inclusive of the whole day. */
export function parseRange(from?: string | null, to?: string | null): ReportRange {
  const parse = (s: string | null | undefined) => {
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };
  const start = parse(from);
  const end = parse(to);
  if (end) end.setHours(23, 59, 59, 999);
  return { from: start, to: end };
}

/** Prisma `createdAt` filter for a range, or undefined when unbounded. */
function createdAtFilter(range: ReportRange) {
  if (!range.from && !range.to) return undefined;
  return { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) };
}

/** The last `months` calendar months, ending today. */
export function lastMonths(months: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - (months - 1), 1);
  return { from, to };
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** Order statuses that represent real, billable demand. */
const COUNTED: OrderStatus[] = ["PENDING", "PROCESSING", "COMPLETED", "PARTIALLY_FULFILLED"];

/** Resolves user ids → names via memberships (Order has no user relation). */
async function namesFor(orgId: string, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const db = getScopedDb(orgId);
  const rows = await db.membership.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, user: { select: { name: true } } },
  });
  return new Map(rows.map((r) => [r.userId, r.user.name]));
}

// ————————————————————————————————————————————————————————
// Orders — one row per order line, order columns repeated.
// ————————————————————————————————————————————————————————

export async function ordersCsv(
  scope: ReportScope,
  range: ReportRange,
  status?: OrderStatus
): Promise<string> {
  const db = getScopedDb(scope.orgId);
  const orders = await db.order.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(status ? { status } : {}),
      ...(createdAtFilter(range) ? { createdAt: createdAtFilter(range) } : {}),
    },
    include: {
      branch: { select: { name: true } },
      shipToAddress: { select: { label: true, city: true } },
      items: {
        include: { product: { select: { sku: true, name: true, brand: true, category: true, unit: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const names = await namesFor(scope.orgId, orders.map((o) => o.placedByUserId));

  type Row = (typeof orders)[number]["items"][number] & { order: (typeof orders)[number] };
  const rows: Row[] = orders.flatMap((o) => o.items.map((it) => ({ ...it, order: o })));

  const columns: CsvColumn<Row>[] = [
    { header: "Order", value: (r) => orderCode(r.order.orderNo) },
    { header: "Placed on", value: (r) => r.order.createdAt.toISOString().slice(0, 10) },
    { header: "Status", value: (r) => statusLabel(r.order.status) },
    { header: "Branch", value: (r) => r.order.branch.name },
    { header: "Placed by", value: (r) => names.get(r.order.placedByUserId) ?? "" },
    { header: "SKU", value: (r) => r.product.sku },
    { header: "Product", value: (r) => r.product.name },
    { header: "Brand", value: (r) => r.product.brand },
    { header: "Category", value: (r) => r.product.category },
    { header: "Unit", value: (r) => r.product.unit },
    { header: "Requested", value: (r) => r.requestedQty },
    { header: "Delivered", value: (r) => r.deliveredQty },
    { header: "Returned", value: (r) => r.returnedQty },
    { header: "Outstanding", value: (r) => Math.max(0, r.requestedQty - r.deliveredQty) },
    { header: "Unit price", value: (r) => csvMoney(r.unitPriceCents) },
    { header: "Line total", value: (r) => csvMoney(r.unitPriceCents * r.requestedQty) },
    { header: "Outstanding reason", value: (r) => r.outstandingReason },
    { header: "Expected", value: (r) => r.outstandingEta?.toISOString().slice(0, 10) },
    { header: "Closure reason", value: (r) => r.order.closureReason },
    { header: "Closure note", value: (r) => r.order.closureNote },
    { header: "Ship to", value: (r) => r.order.shipToAddress?.label },
    { header: "City", value: (r) => r.order.shipToAddress?.city },
    { header: "Delivery note", value: (r) => r.order.deliveryNote },
  ];

  return toCsv(columns, rows);
}

// ————————————————————————————————————————————————————————
// Inventory — a stock-take snapshot with valuation.
// ————————————————————————————————————————————————————————

export async function inventoryCsv(scope: ReportScope): Promise<string> {
  const db = getScopedDb(scope.orgId);
  const [products, reserved] = await Promise.all([
    db.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    reservedByProduct(scope.orgId),
  ]);

  type Row = (typeof products)[number];
  const res = (p: Row) => reserved.get(p.id) ?? 0;
  const avail = (p: Row) => availableOf(p.stock, res(p));

  const columns: CsvColumn<Row>[] = [
    { header: "SKU", value: (p) => p.sku },
    { header: "Product", value: (p) => p.name },
    { header: "Brand", value: (p) => p.brand },
    { header: "Category", value: (p) => p.category },
    { header: "Unit", value: (p) => p.unit },
    { header: "In stock", value: (p) => p.stock },
    { header: "Reserved", value: (p) => res(p) },
    { header: "Available", value: (p) => avail(p) },
    { header: "Minimum", value: (p) => p.minStock },
    { header: "State", value: (p) => ({ in: "OK", low: "Low", out: "Out" })[stockState(avail(p), p.minStock)] },
    { header: "Unit price", value: (p) => csvMoney(p.priceCents) },
    { header: "Stock value", value: (p) => csvMoney(p.priceCents * p.stock) },
    { header: "Active", value: (p) => (p.active ? "Yes" : "No") },
  ];

  return toCsv(columns, products);
}

// ————————————————————————————————————————————————————————
// Audit log & stock movements.
// ————————————————————————————————————————————————————————

export async function auditCsv(scope: ReportScope, range: ReportRange): Promise<string> {
  const db = getScopedDb(scope.orgId);
  const entries = await db.auditLogEntry.findMany({
    where: createdAtFilter(range) ? { createdAt: createdAtFilter(range) } : undefined,
    orderBy: { createdAt: "desc" },
  });

  type Row = (typeof entries)[number];
  const columns: CsvColumn<Row>[] = [
    { header: "When", value: (e) => e.createdAt },
    { header: "Who", value: (e) => e.userName ?? "System" },
    { header: "What", value: (e) => e.action },
    { header: "Entity", value: (e) => e.entityType },
    { header: "Entity id", value: (e) => e.entityId },
  ];

  return toCsv(columns, entries);
}

export async function movementsCsv(scope: ReportScope, range: ReportRange): Promise<string> {
  const db = getScopedDb(scope.orgId);
  const movements = await db.stockMovement.findMany({
    where: createdAtFilter(range) ? { createdAt: createdAtFilter(range) } : undefined,
    include: { product: { select: { sku: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const names = await namesFor(scope.orgId, movements.map((m) => m.userId ?? ""));

  type Row = (typeof movements)[number];
  const columns: CsvColumn<Row>[] = [
    { header: "When", value: (m) => m.createdAt },
    { header: "SKU", value: (m) => m.product.sku },
    { header: "Product", value: (m) => m.product.name },
    { header: "Change", value: (m) => m.newQty - m.prevQty },
    { header: "From", value: (m) => m.prevQty },
    { header: "To", value: (m) => m.newQty },
    { header: "Action", value: (m) => m.action },
    { header: "By", value: (m) => (m.userId ? names.get(m.userId) ?? "" : "System") },
  ];

  return toCsv(columns, movements);
}

// ————————————————————————————————————————————————————————
// Monthly summary — what the /admin/reports page renders and prints.
// ————————————————————————————————————————————————————————

export type MonthRow = {
  key: string;
  label: string;
  orders: number;
  unitsRequested: number;
  unitsDelivered: number;
  revenueCents: number;
  cancelled: number;
};

export type BranchRow = { name: string; orders: number; unitsRequested: number; revenueCents: number };
export type ProductRow = { sku: string; name: string; units: number; revenueCents: number };

export type Summary = {
  range: ReportRange;
  totals: {
    orders: number;
    unitsRequested: number;
    unitsDelivered: number;
    revenueCents: number;
    fillRate: number;
    openOrders: number;
    cancelled: number;
    rejected: number;
    returned: number;
  };
  months: MonthRow[];
  branches: BranchRow[];
  topProducts: ProductRow[];
};

export async function monthlySummary(scope: ReportScope, range: ReportRange): Promise<Summary> {
  const db = getScopedDb(scope.orgId);
  const orders = await db.order.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(createdAtFilter(range) ? { createdAt: createdAtFilter(range) } : {}),
    },
    include: {
      branch: { select: { name: true } },
      items: {
        select: {
          requestedQty: true,
          deliveredQty: true,
          unitPriceCents: true,
          product: { select: { sku: true, name: true } },
        },
      },
    },
  });

  const months = new Map<string, MonthRow>();
  const branches = new Map<string, BranchRow>();
  const products = new Map<string, ProductRow>();
  const totals: Summary["totals"] = {
    orders: 0,
    unitsRequested: 0,
    unitsDelivered: 0,
    revenueCents: 0,
    fillRate: 0,
    openOrders: 0,
    cancelled: 0,
    rejected: 0,
    returned: 0,
  };

  for (const o of orders) {
    if (o.status === "CANCELLED") totals.cancelled++;
    if (o.status === "REJECTED") totals.rejected++;
    if (o.status === "RETURNED") totals.returned++;
    if (o.status === "PENDING" || o.status === "PROCESSING") totals.openOrders++;

    const key = monthKey(o.createdAt);
    const month =
      months.get(key) ??
      { key, label: monthLabel(key), orders: 0, unitsRequested: 0, unitsDelivered: 0, revenueCents: 0, cancelled: 0 };
    months.set(key, month);
    if (o.status === "CANCELLED" || o.status === "REJECTED") month.cancelled++;

    // Cancelled/rejected/returned orders are excluded from demand and revenue —
    // they never became real business — but still show in the counts above.
    if (!COUNTED.includes(o.status)) continue;

    const requested = o.items.reduce((s, it) => s + it.requestedQty, 0);
    const delivered = o.items.reduce((s, it) => s + it.deliveredQty, 0);

    totals.orders++;
    totals.unitsRequested += requested;
    totals.unitsDelivered += delivered;
    totals.revenueCents += o.totalCents;

    month.orders++;
    month.unitsRequested += requested;
    month.unitsDelivered += delivered;
    month.revenueCents += o.totalCents;

    const branch = branches.get(o.branch.name) ?? { name: o.branch.name, orders: 0, unitsRequested: 0, revenueCents: 0 };
    branch.orders++;
    branch.unitsRequested += requested;
    branch.revenueCents += o.totalCents;
    branches.set(o.branch.name, branch);

    for (const it of o.items) {
      const p = products.get(it.product.sku) ?? { sku: it.product.sku, name: it.product.name, units: 0, revenueCents: 0 };
      p.units += it.requestedQty;
      p.revenueCents += it.unitPriceCents * it.requestedQty;
      products.set(it.product.sku, p);
    }
  }

  totals.fillRate = totals.unitsRequested
    ? Math.round((totals.unitsDelivered / totals.unitsRequested) * 100)
    : 0;

  return {
    range,
    totals,
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    branches: [...branches.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    topProducts: [...products.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10),
  };
}

// ————————————————————————————————————————————————————————
// Customer sales — the salon-manager billing report.
// ————————————————————————————————————————————————————————

export type SaleDayRow = { key: string; label: string; bills: number; revenueCents: number };
export type SaleProductRow = { name: string; units: number; revenueCents: number; marginCents: number };
export type PayRow = { mode: PaymentModeValue; label: string; bills: number; revenueCents: number };

export type SalesSummary = {
  range: ReportRange;
  totals: {
    bills: number;
    units: number;
    /** Taxable value billed to customers (pre-GST). */
    netCents: number;
    taxCents: number;
    /** What customers paid (net + GST). */
    grossCents: number;
    /** net − cost of goods sold. */
    marginCents: number;
    voided: number;
  };
  days: SaleDayRow[];
  payments: PayRow[];
  topProducts: SaleProductRow[];
};

/** Only real, settled bills count towards revenue; VOID bills are excluded. */
export async function salesSummary(scope: ReportScope, range: ReportRange): Promise<SalesSummary> {
  const db = getScopedDb(scope.orgId);
  const sales = await db.sale.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(createdAtFilter(range) ? { createdAt: createdAtFilter(range) } : {}),
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const totals: SalesSummary["totals"] = {
    bills: 0, units: 0, netCents: 0, taxCents: 0, grossCents: 0, marginCents: 0, voided: 0,
  };
  const days = new Map<string, SaleDayRow>();
  const payments = new Map<PaymentModeValue, PayRow>();
  const products = new Map<string, SaleProductRow>();

  for (const s of sales) {
    if (s.status === "VOID") {
      totals.voided++;
      continue;
    }
    totals.bills++;
    totals.netCents += s.subtotalCents;
    totals.taxCents += s.taxCents;
    totals.grossCents += s.totalCents;
    totals.marginCents += s.subtotalCents - s.costCents;

    const key = s.createdAt.toISOString().slice(0, 10);
    const day = days.get(key) ?? { key, label: key, bills: 0, revenueCents: 0 };
    day.bills++;
    day.revenueCents += s.totalCents;
    days.set(key, day);

    const mode = s.paymentMode as PaymentModeValue;
    const pay = payments.get(mode) ?? { mode, label: PAYMENT_MODE_LABEL[mode], bills: 0, revenueCents: 0 };
    pay.bills++;
    pay.revenueCents += s.totalCents;
    payments.set(mode, pay);

    for (const it of s.items) {
      totals.units += it.qty;
      const p = products.get(it.name) ?? { name: it.name, units: 0, revenueCents: 0, marginCents: 0 };
      p.units += it.qty;
      p.revenueCents += it.lineNetCents;
      p.marginCents += it.lineNetCents - it.unitCostCents * it.qty;
      products.set(it.name, p);
    }
  }

  return {
    range,
    totals,
    days: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
    payments: [...payments.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    topProducts: [...products.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 12),
  };
}

/** One CSV row per bill line — the salon manager's sales export. */
export async function salesCsv(scope: ReportScope, range: ReportRange): Promise<string> {
  const db = getScopedDb(scope.orgId);
  const sales = await db.sale.findMany({
    where: {
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(createdAtFilter(range) ? { createdAt: createdAtFilter(range) } : {}),
    },
    include: { branch: { select: { name: true } }, items: true },
    orderBy: { createdAt: "desc" },
  });

  type Row = (typeof sales)[number]["items"][number] & { sale: (typeof sales)[number] };
  const rows: Row[] = sales.flatMap((s) => s.items.map((it) => ({ ...it, sale: s })));

  const columns: CsvColumn<Row>[] = [
    { header: "Invoice", value: (r) => invoiceCode(r.sale.invoiceNo) },
    { header: "Date", value: (r) => r.sale.createdAt.toISOString().slice(0, 10) },
    { header: "Status", value: (r) => (r.sale.status === "VOID" ? "Void" : "Completed") },
    { header: "Branch", value: (r) => r.sale.branch.name },
    { header: "Customer", value: (r) => r.sale.customerName },
    { header: "Phone", value: (r) => r.sale.customerPhone },
    { header: "Payment", value: (r) => PAYMENT_MODE_LABEL[r.sale.paymentMode as PaymentModeValue] },
    { header: "Product", value: (r) => r.name },
    { header: "HSN", value: (r) => r.hsn },
    { header: "Qty", value: (r) => r.qty },
    { header: "Unit price", value: (r) => csvMoney(r.unitPriceCents) },
    { header: "Taxable", value: (r) => csvMoney(r.lineNetCents) },
    { header: "GST %", value: (r) => r.gstRate },
    { header: "GST", value: (r) => csvMoney(r.taxCents) },
    { header: "Line total", value: (r) => csvMoney(r.lineTotalCents) },
    { header: "Unit cost", value: (r) => csvMoney(r.unitCostCents) },
    { header: "Margin", value: (r) => csvMoney(r.lineNetCents - r.unitCostCents * r.qty) },
  ];

  return toCsv(columns, rows);
}
