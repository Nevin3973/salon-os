import type { NextRequest } from "next/server";
import type { OrderStatus, Role } from "@prisma/client";
import { resolveOrgContext, unauthorized, apiError } from "@/server/api/auth";
import { prisma } from "@/lib/db";
import { csvResponse, toCsv, csvMoney, type CsvColumn } from "@/lib/csv";
import { parseRange, ordersCsv, inventoryCsv, auditCsv, movementsCsv, salesCsv, type ReportScope } from "@/lib/reports";
import { tallyXml, hsnSummary } from "@/lib/tally";

/**
 * CSV downloads. Reachable from the console (browser session) and from the
 * versioned API's Bearer key, so a reporting tool can pull the same numbers.
 *
 * `?from=&to=` are yyyy-mm-dd and optional (unbounded when omitted);
 * `?status=` narrows the orders dataset.
 *
 * A Purchase Manager may only export their own branch's orders and has no
 * access to the org-wide inventory, movement or audit datasets. An API key
 * has no role and is treated as an org-wide machine caller.
 */

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "PARTIALLY_FULFILLED",
  "CANCELLED",
  "REJECTED",
  "RETURNED",
];

/** Roles allowed per dataset; `null` (API key) is always allowed. */
const ALLOWED: Record<string, Role[]> = {
  orders: ["PURCHASE_MANAGER", "WAREHOUSE_MANAGER", "SUPER_ADMIN"],
  sales: ["PURCHASE_MANAGER", "SUPER_ADMIN"],
  inventory: ["WAREHOUSE_MANAGER", "SUPER_ADMIN"],
  movements: ["WAREHOUSE_MANAGER", "SUPER_ADMIN"],
  audit: ["SUPER_ADMIN"],
  /** Accounting hand-offs: Tally voucher import and the GSTR-1 HSN table. */
  tally: ["PURCHASE_MANAGER", "SUPER_ADMIN"],
  hsn: ["PURCHASE_MANAGER", "SUPER_ADMIN"],
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  const allowedRoles = ALLOWED[dataset];
  if (!allowedRoles) {
    return apiError(404, "unknown_dataset", `No such export. Try: ${Object.keys(ALLOWED).join(", ")}`);
  }

  const ctx = await resolveOrgContext(req);
  if (!ctx) return unauthorized();
  if (ctx.role && !allowedRoles.includes(ctx.role)) {
    return apiError(403, "forbidden", "Your role cannot export this data.");
  }

  const sp = req.nextUrl.searchParams;
  const range = parseRange(sp.get("from"), sp.get("to"));
  const status = sp.get("status");
  if (status && !ORDER_STATUSES.includes(status as OrderStatus)) {
    return apiError(400, "invalid_status", `status must be one of ${ORDER_STATUSES.join(", ")}`);
  }

  // A Purchase Manager without a branch has nothing they are entitled to see —
  // never fall through to an org-wide export.
  if (ctx.role === "PURCHASE_MANAGER" && !ctx.locationId) {
    return apiError(403, "no_branch", "Your account is not assigned to a branch.");
  }

  const scope: ReportScope = {
    orgId: ctx.orgId,
    branchId: ctx.role === "PURCHASE_MANAGER" ? ctx.locationId : null,
  };

  switch (dataset) {
    case "orders":
      return csvResponse("orders", await ordersCsv(scope, range, (status as OrderStatus) || undefined));
    case "sales":
      return csvResponse("sales", await salesCsv(scope, range));
    case "inventory":
      return csvResponse("inventory", await inventoryCsv(scope));
    case "movements":
      return csvResponse("stock-movements", await movementsCsv(scope, range));
    case "audit":
      return csvResponse("audit-log", await auditCsv(scope, range));

    case "tally": {
      // Tally matches the target company by name, so let the caller override it
      // (?company=) when their Tally company differs from the workspace name.
      const org = await prisma.org.findUnique({
        where: { id: ctx.orgId },
        select: { name: true, legalName: true },
      });
      const companyName =
        sp.get("company")?.trim() || org?.legalName || org?.name || "Company";
      const xml = await tallyXml(scope, range, { companyName });
      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="tally-vouchers-${new Date()
            .toISOString()
            .slice(0, 10)}.xml"`,
          "Cache-Control": "no-store",
        },
      });
    }

    case "hsn": {
      const rows = await hsnSummary(scope, range);
      type Row = (typeof rows)[number];
      const columns: CsvColumn<Row>[] = [
        { header: "HSN", value: (r) => r.hsn },
        { header: "GST %", value: (r) => r.rate },
        { header: "Quantity", value: (r) => r.qty },
        { header: "Taxable value", value: (r) => csvMoney(r.taxableCents) },
        { header: "CGST", value: (r) => csvMoney(r.cgstCents) },
        { header: "SGST", value: (r) => csvMoney(r.sgstCents) },
        { header: "Total tax", value: (r) => csvMoney(r.cgstCents + r.sgstCents) },
      ];
      return csvResponse("hsn-summary", toCsv(columns, rows));
    }

    default:
      return apiError(404, "unknown_dataset", "No such export.");
  }
}
