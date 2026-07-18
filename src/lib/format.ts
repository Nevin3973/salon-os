/** Order display number, e.g. 232 -> "ORD-0232". */
export function orderCode(orderNo: number): string {
  return `ORD-${String(orderNo).padStart(4, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  CANCELLED: "Cancelled",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
