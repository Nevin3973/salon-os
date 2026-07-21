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

// Why the warehouse declined an order outright. A rejection moves no stock and
// is only possible before anything has been dispatched.
export const REJECTION_REASONS = [
  "Product discontinued",
  "Duplicate order",
  "Order details incorrect",
  "Branch asked to withdraw",
  "Cannot supply",
  "Other",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

// Why delivered goods came back and were booked into stock again.
export const RETURN_REASONS = [
  "Damaged in transit",
  "Wrong item sent",
  "Over-delivered",
  "Expired or short-dated",
  "Branch no longer needs it",
  "Other",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];
