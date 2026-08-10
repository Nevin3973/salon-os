import { describe, it, expect } from "vitest";
import { normalisePhone, isPlausibleIndianMobile, formatPhone } from "./customer";

describe("normalisePhone", () => {
  it("collapses the ways a cashier might type the same number", () => {
    // All of these are one customer. If they normalise differently, that
    // person ends up with several records and a split history.
    const forms = [
      "9876543210",
      "+91 98765 43210",
      "+919876543210",
      "91 98765 43210",
      "098765 43210",
      "98765-43210",
      " 98765 43210 ",
    ];
    const normalised = new Set(forms.map(normalisePhone));
    expect(normalised).toEqual(new Set(["9876543210"]));
  });

  it("leaves an unrecognised number as its digits rather than mangling it", () => {
    // A landline or an overseas number should still store and match
    // consistently, even though it is not a ten-digit Indian mobile.
    expect(normalisePhone("044 2833 1234")).toBe("04428331234");
    expect(normalisePhone("+1 415 555 0100")).toBe("14155550100");
  });

  it("does not strip a leading 91 that is part of a real mobile number", () => {
    // 9176543210 is a valid 10-digit mobile that happens to start with 91 —
    // stripping it would turn a real number into a wrong one.
    expect(normalisePhone("9176543210")).toBe("9176543210");
  });
});

describe("isPlausibleIndianMobile", () => {
  it("accepts the 6-9 series India issues, in any typed form", () => {
    expect(isPlausibleIndianMobile("9876543210")).toBe(true);
    expect(isPlausibleIndianMobile("+91 63012 45678")).toBe(true);
    expect(isPlausibleIndianMobile("7012345678")).toBe(true);
  });

  it("rejects numbers that cannot be a mobile", () => {
    expect(isPlausibleIndianMobile("1234567890")).toBe(false); // wrong series
    expect(isPlausibleIndianMobile("98765")).toBe(false); // too short
    expect(isPlausibleIndianMobile("")).toBe(false);
    expect(isPlausibleIndianMobile("98765432101")).toBe(false); // too long
  });
});

describe("formatPhone", () => {
  it("splits a mobile for reading back to the customer", () => {
    expect(formatPhone("+919876543210")).toBe("98765 43210");
  });

  it("leaves anything else alone", () => {
    expect(formatPhone("04428331234")).toBe("04428331234");
  });
});
