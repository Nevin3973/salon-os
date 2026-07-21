import type { NextRequest } from "next/server";
import type { OrderStatus, Role } from "@prisma/client";
import { resolveOrgContext, unauthorized, apiError } from "@/server/api/auth";
import { csvResponse } from "@/lib/csv";
import { parseRange, ordersCsv, inventoryCsv, auditCsv, movementsCsv, type ReportScope } from "@/lib/reports";

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
  inventory: ["WAREHOUSE_MANAGER", "SUPER_ADMIN"],
  movements: ["WAREHOUSE_MANAGER", "SUPER_ADMIN"],
  audit: ["SUPER_ADMIN"],
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
    case "inventory":
      return csvResponse("inventory", await inventoryCsv(scope));
    case "movements":
      return csvResponse("stock-movements", await movementsCsv(scope, range));
    case "audit":
      return csvResponse("audit-log", await auditCsv(scope, range));
    default:
      return apiError(404, "unknown_dataset", "No such export.");
  }
}
