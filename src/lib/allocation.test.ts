import { describe, it, expect } from "vitest";
import { allocateDispatch, type AllocationLine } from "./allocation";

const line = (over: Partial<AllocationLine> = {}): AllocationLine => ({
  itemId: "i1",
  productId: "p1",
  requestedQty: 10,
  deliveredQty: 0,
  requestedDispatch: 10,
  ...over,
});

describe("allocateDispatch", () => {
  it("ships exactly what was asked when stock and request allow it", () => {
    const [r] = allocateDispatch([line({ requestedDispatch: 4 })], new Map([["p1", 100]]));
    expect(r.qty).toBe(4);
    expect(r.remainingAfter).toBe(6);
  });

  it("clamps to physical stock", () => {
    const [r] = allocateDispatch([line({ requestedDispatch: 10 })], new Map([["p1", 3]]));
    expect(r.qty).toBe(3);
    expect(r.remainingAfter).toBe(7);
  });

  it("clamps to what is still owed on the line", () => {
    const [r] = allocateDispatch(
      [line({ deliveredQty: 8, requestedDispatch: 999 })],
      new Map([["p1", 100]])
    );
    expect(r.qty).toBe(2);
    expect(r.remainingAfter).toBe(0);
  });

  it("never goes negative on hostile input", () => {
    const [a] = allocateDispatch([line({ requestedDispatch: -5 })], new Map([["p1", 10]]));
    expect(a.qty).toBe(0);
    const [b] = allocateDispatch(
      [line({ deliveredQty: 15 /* over-delivered edge */ })],
      new Map([["p1", 10]])
    );
    expect(b.qty).toBe(0);
    expect(b.remainingAfter).toBe(0);
  });

  it("floors fractional dispatch requests", () => {
    const [r] = allocateDispatch([line({ requestedDispatch: 2.9 })], new Map([["p1", 10]]));
    expect(r.qty).toBe(2);
  });

  it("two lines of the same product cannot jointly oversell it", () => {
    const rows = allocateDispatch(
      [
        line({ itemId: "a", requestedQty: 6, requestedDispatch: 6 }),
        line({ itemId: "b", requestedQty: 6, requestedDispatch: 6 }),
      ],
      new Map([["p1", 8]])
    );
    expect(rows[0].qty).toBe(6);
    expect(rows[1].qty).toBe(2); // only 2 left
    expect(rows[0].qty + rows[1].qty).toBe(8);
  });

  it("treats unknown products as zero stock", () => {
    const [r] = allocateDispatch([line({ productId: "ghost" })], new Map());
    expect(r.qty).toBe(0);
    expect(r.remainingAfter).toBe(10);
  });
});

describe("allocateDispatch with negative stock enabled", () => {
  it("sends what the branch asked for even with nothing on the shelf", () => {
    const [r] = allocateDispatch(
      [{ itemId: "i1", productId: "p1", requestedQty: 10, deliveredQty: 0, requestedDispatch: 10 }],
      new Map([["p1", 0]]),
      true
    );
    expect(r.qty).toBe(10);
    expect(r.remainingAfter).toBe(0);
  });

  it("still refuses to send more than the line owes", () => {
    // Negative stock is permission to send early, never to over-send.
    const [r] = allocateDispatch(
      [{ itemId: "i1", productId: "p1", requestedQty: 4, deliveredQty: 1, requestedDispatch: 99 }],
      new Map([["p1", 1000]]),
      true
    );
    expect(r.qty).toBe(3);
  });

  it("carries the running balance below zero across two lines of one product", () => {
    const res = allocateDispatch(
      [
        { itemId: "i1", productId: "p1", requestedQty: 5, deliveredQty: 0, requestedDispatch: 5 },
        { itemId: "i2", productId: "p1", requestedQty: 4, deliveredQty: 0, requestedDispatch: 4 },
      ],
      new Map([["p1", 2]]),
      true
    );
    expect(res.map((r) => r.qty)).toEqual([5, 4]);
  });

  it("changes nothing when the switch is off", () => {
    const [r] = allocateDispatch(
      [{ itemId: "i1", productId: "p1", requestedQty: 10, deliveredQty: 0, requestedDispatch: 10 }],
      new Map([["p1", 3]]),
      false
    );
    expect(r.qty).toBe(3);
    expect(r.remainingAfter).toBe(7);
  });

  it("defaults to off when no flag is passed", () => {
    const [r] = allocateDispatch(
      [{ itemId: "i1", productId: "p1", requestedQty: 10, deliveredQty: 0, requestedDispatch: 10 }],
      new Map([["p1", 0]])
    );
    expect(r.qty).toBe(0);
  });
});
