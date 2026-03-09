import { describe, it, expect } from "vitest";
import {
  parseOrderFilled,
  computeFpmmPrice,
  computeNegRiskYesPrice,
  getUserPositionEntityId,
} from "../../utils/pnl.js";

describe("parseOrderFilled", () => {
  it("returns BUY when makerAssetId === 0n", () => {
    const result = parseOrderFilled({
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 500_000n,
      takerAmountFilled: 1_000_000n,
      maker: "0xabc",
    });
    expect(result.side).toBe("BUY");
    expect(result.account).toBe("0xabc");
    expect(result.positionId).toBe(42n);
    expect(result.baseAmount).toBe(1_000_000n); // takerAmountFilled
    expect(result.quoteAmount).toBe(500_000n); // makerAmountFilled
  });

  it("returns SELL when makerAssetId !== 0n", () => {
    const result = parseOrderFilled({
      makerAssetId: 42n,
      takerAssetId: 0n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 500_000n,
      maker: "0xdef",
    });
    expect(result.side).toBe("SELL");
    expect(result.account).toBe("0xdef");
    expect(result.positionId).toBe(42n);
    expect(result.baseAmount).toBe(1_000_000n); // makerAmountFilled
    expect(result.quoteAmount).toBe(500_000n); // takerAmountFilled
  });

  it("handles makerAmountFilled === 0n", () => {
    const result = parseOrderFilled({
      makerAssetId: 0n,
      takerAssetId: 10n,
      makerAmountFilled: 0n,
      takerAmountFilled: 100n,
      maker: "0x123",
    });
    expect(result.side).toBe("BUY");
    expect(result.quoteAmount).toBe(0n);
    expect(result.baseAmount).toBe(100n);
  });
});

describe("computeFpmmPrice", () => {
  it("returns 500_000n for balanced pool at index 0", () => {
    expect(computeFpmmPrice([10_000_000n, 10_000_000n], 0)).toBe(500_000n);
  });

  it("returns 500_000n for balanced pool at index 1", () => {
    expect(computeFpmmPrice([10_000_000n, 10_000_000n], 1)).toBe(500_000n);
  });

  it("returns 750_000n for [5M, 15M] at index 0", () => {
    expect(computeFpmmPrice([5_000_000n, 15_000_000n], 0)).toBe(750_000n);
  });

  it("returns 0n when total is zero", () => {
    expect(computeFpmmPrice([0n, 0n], 0)).toBe(0n);
  });
});

describe("computeNegRiskYesPrice", () => {
  it("computes basic case: noPrice=500_000, noCount=2, questionCount=3", () => {
    // yesPrice = (500_000 * 2 - 1_000_000 * (2 - 1)) / (3 - 2)
    // = (1_000_000 - 1_000_000) / 1 = 0
    const result = computeNegRiskYesPrice(500_000n, 2, 3);
    expect(result).toBe(0n);
  });

  it("returns 0n when yesCount is 0", () => {
    expect(computeNegRiskYesPrice(500_000n, 3, 3)).toBe(0n);
  });

  it("computes single NO: noCount=1, questionCount=2", () => {
    // yesPrice = (500_000 * 1 - 1_000_000 * 0) / 1 = 500_000
    const result = computeNegRiskYesPrice(500_000n, 1, 2);
    expect(result).toBe(500_000n);
  });

  it("computes with higher noPrice", () => {
    // noPrice=800_000, noCount=2, questionCount=4, yesCount=2
    // yesPrice = (800_000 * 2 - 1_000_000 * 1) / 2 = (1_600_000 - 1_000_000) / 2 = 300_000
    const result = computeNegRiskYesPrice(800_000n, 2, 4);
    expect(result).toBe(300_000n);
  });
});

describe("getUserPositionEntityId", () => {
  it("returns user-tokenId format", () => {
    expect(getUserPositionEntityId("0xabc", 42n)).toBe("0xabc-42");
  });
});
