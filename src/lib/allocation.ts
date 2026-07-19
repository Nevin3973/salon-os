/**
 * Pure dispatch-allocation logic, extracted so it can be unit-tested.
 *
 * Given the order's lines, current physical stock, and what the warehouse
 * asked to send, decide how much each line actually gets:
 *   min(asked, still owed on the line, stock left for that product)
 * with a running stock counter so two lines of the same product can never
 * jointly take more than exists. Never trusts the client's numbers.
 */

export type AllocationLine = {
  itemId: string;
  productId: string;
  requestedQty: number;
  deliveredQty: number;
  /** What the warehouse asked to dispatch now (untrusted client input). */
  requestedDispatch: number;
};

export type AllocationResult = {
  itemId: string;
  productId: string;
  /** Units that will actually ship now. */
  qty: number;
  /** Units still owed on this line after this dispatch. */
  remainingAfter: number;
};

export function allocateDispatch(
  lines: AllocationLine[],
  stockByProduct: Map<string, number>
): AllocationResult[] {
  const running = new Map(stockByProduct);
  return lines.map((line) => {
    const remaining = Math.max(0, line.requestedQty - line.deliveredQty);
    const available = running.get(line.productId) ?? 0;
    const qty = Math.max(0, Math.min(Math.floor(line.requestedDispatch), remaining, available));
    running.set(line.productId, available - qty);
    return {
      itemId: line.itemId,
      productId: line.productId,
      qty,
      remainingAfter: remaining - qty,
    };
  });
}
