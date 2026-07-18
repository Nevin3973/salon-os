// Reasons a warehouse line can remain short when an order is closed.
// Ported from the prototype's REASONS list.
export const OUTSTANDING_REASONS = [
  "Out of stock",
  "Awaiting supplier",
  "Damaged stock",
  "Quality hold",
  "Other",
] as const;

export type OutstandingReason = (typeof OUTSTANDING_REASONS)[number];
