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

// How a customer paid for a counter sale.
export const PAYMENT_MODES = ["CASH", "CARD", "UPI"] as const;
export type PaymentModeValue = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABEL: Record<PaymentModeValue, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
};

// Why a customer bill was voided; voiding returns its units to the shelf.
export const VOID_SALE_REASONS = [
  "Billing error",
  "Customer changed mind",
  "Wrong item billed",
  "Payment failed",
  "Duplicate bill",
  "Other",
] as const;

export type VoidSaleReason = (typeof VOID_SALE_REASONS)[number];

// Why a salon manager corrected their shelf count by hand.
export const BRANCH_ADJUST_REASONS = [
  "Stock count correction",
  "Damaged / expired",
  "Used in service",
  "Lost or missing",
  "Other",
] as const;

export type BranchAdjustReason = (typeof BRANCH_ADJUST_REASONS)[number];

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
