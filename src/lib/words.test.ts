import { describe, it, expect } from "vitest";
import { numberToIndianWords, amountInWords } from "./words";

describe("amountInWords", () => {
  // Both strings are copied from the client's own Tally invoice, which is the
  // document this output has to match line for line.
  it("matches the totals on the warehouse invoice we were sent", () => {
    expect(amountInWords(578_500)).toBe("INR Five Thousand Seven Hundred Eighty Five Only");
    expect(amountInWords(88_248)).toBe("INR Eight Hundred Eighty Two and Forty Eight paise Only");
  });

  it("says Only for a whole rupee amount and names paise otherwise", () => {
    expect(amountInWords(100)).toBe("INR One Only");
    expect(amountInWords(105)).toBe("INR One and Five paise Only");
    expect(amountInWords(0)).toBe("INR Zero Only");
  });

  it("handles a credit note's negative amount", () => {
    expect(amountInWords(-25_000)).toBe("Minus INR Two Hundred Fifty Only");
  });
});

describe("numberToIndianWords", () => {
  it("groups in lakh and crore, not millions", () => {
    expect(numberToIndianWords(100_000)).toBe("One Lakh");
    expect(numberToIndianWords(1_000_000)).toBe("Ten Lakh");
    expect(numberToIndianWords(10_000_000)).toBe("One Crore");
    // The whole stock summary is worth about this much.
    expect(numberToIndianWords(2_557_812)).toBe(
      "Twenty Five Lakh Fifty Seven Thousand Eight Hundred Twelve"
    );
  });

  it("reads the teens and the tens boundary correctly", () => {
    expect(numberToIndianWords(19)).toBe("Nineteen");
    expect(numberToIndianWords(20)).toBe("Twenty");
    expect(numberToIndianWords(90)).toBe("Ninety");
    expect(numberToIndianWords(115)).toBe("One Hundred Fifteen");
  });

  it("keeps going above ninety-nine crore", () => {
    expect(numberToIndianWords(1_000_000_000)).toBe("One Hundred Crore");
  });
});
