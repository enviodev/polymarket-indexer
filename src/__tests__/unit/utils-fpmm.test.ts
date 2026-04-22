import { describe, it, expect } from "vitest";
import BigNumber from "bignumber.js";
import {
  nthRoot,
  calculatePrices,
  scaleBigInt,
  maxBigInt,
  timestampToDay,
} from "../../utils/fpmm.js";

describe("nthRoot", () => {
  it("returns 0n for x=0", () => {
    expect(nthRoot(0n, 2)).toBe(0n);
  });

  it("returns 1n for nthRoot(1, 1)", () => {
    expect(nthRoot(1n, 1)).toBe(1n);
  });

  it("computes square root of 9", () => {
    expect(nthRoot(9n, 2)).toBe(3n);
  });

  it("computes square root of 100", () => {
    expect(nthRoot(100n, 2)).toBe(10n);
  });

  it("computes cube root of 27", () => {
    expect(nthRoot(27n, 3)).toBe(3n);
  });

  it("computes square root of 1000000 approximately as 1000", () => {
    expect(nthRoot(1000000n, 2)).toBe(1000n);
  });

  it("returns 0n when n=0 (edge case)", () => {
    expect(nthRoot(10n, 0)).toBe(0n);
  });
});

describe("calculatePrices", () => {
  it("returns [0.5, 0.5] for balanced amounts", () => {
    const prices = calculatePrices([10n, 10n]);
    expect(prices[0]!.toNumber()).toBeCloseTo(0.5, 5);
    expect(prices[1]!.toNumber()).toBeCloseTo(0.5, 5);
  });

  it("returns approximately [0.75, 0.25] for [10, 30]", () => {
    const prices = calculatePrices([10n, 30n]);
    expect(prices[0]!.toNumber()).toBeCloseTo(0.75, 2);
    expect(prices[1]!.toNumber()).toBeCloseTo(0.25, 2);
  });

  it("returns [0, 0] for zero balances", () => {
    const prices = calculatePrices([0n, 0n]);
    expect(prices[0]!.isEqualTo(0)).toBe(true);
    expect(prices[1]!.isEqualTo(0)).toBe(true);
  });

  it("throws on [100n, 0n] due to division by zero in product/amounts[i]", () => {
    // product = 100 * 0 = 0, totalBalance = 100, but product/amounts[1] => 0n/0n throws
    expect(() => calculatePrices([100n, 0n])).toThrow();
  });
});

describe("scaleBigInt", () => {
  it("scales 1_000_000 to 1", () => {
    expect(scaleBigInt(1_000_000n).isEqualTo(new BigNumber(1))).toBe(true);
  });

  it("scales 500_000 to 0.5", () => {
    expect(scaleBigInt(500_000n).isEqualTo(new BigNumber(0.5))).toBe(true);
  });

  it("scales 0 to 0", () => {
    expect(scaleBigInt(0n).isEqualTo(new BigNumber(0))).toBe(true);
  });
});

describe("maxBigInt", () => {
  it("returns the maximum value from array", () => {
    expect(maxBigInt([1n, 5n, 3n])).toBe(5n);
  });

  it("returns 0n for single-element [0n]", () => {
    expect(maxBigInt([0n])).toBe(0n);
  });
});

describe("timestampToDay", () => {
  it("returns 1n for one full day in seconds", () => {
    expect(timestampToDay(86400)).toBe(1n);
  });

  it("returns 0n for timestamp 0", () => {
    expect(timestampToDay(0)).toBe(0n);
  });
});
