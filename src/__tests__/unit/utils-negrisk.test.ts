import { describe, it, expect } from "vitest";
import {
  getNegRiskQuestionId,
  getConditionId,
  getNegRiskConditionId,
  getNegRiskPositionId,
  indexSetContains,
  getEventKey,
} from "../../utils/negRisk.js";

describe("getNegRiskQuestionId", () => {
  it("replaces last byte of marketId with question index", () => {
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const result = getNegRiskQuestionId(marketId, 1);
    expect(result).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
  });

  it("handles index > 15 (multi-digit hex)", () => {
    const marketId =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567800" as `0x${string}`;
    const result = getNegRiskQuestionId(marketId, 255);
    expect(result).toBe(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678ff",
    );
  });

  it("handles index 0", () => {
    const marketId =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaff" as `0x${string}`;
    const result = getNegRiskQuestionId(marketId, 0);
    // slices first 64 chars ("0x" + 62 hex), then appends "00"
    expect(result).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00",
    );
  });
});

describe("getConditionId", () => {
  it("produces a valid 0x-prefixed hex string", () => {
    const oracle =
      "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as `0x${string}`;
    const questionId =
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
    const result = getConditionId(oracle, questionId);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces deterministic output", () => {
    const oracle =
      "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as `0x${string}`;
    const questionId =
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
    const result1 = getConditionId(oracle, questionId);
    const result2 = getConditionId(oracle, questionId);
    expect(result1).toBe(result2);
  });
});

describe("getNegRiskConditionId", () => {
  it("produces a valid hex conditionId", () => {
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const result = getNegRiskConditionId(marketId, 0);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes output for different question indices", () => {
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const r0 = getNegRiskConditionId(marketId, 0);
    const r1 = getNegRiskConditionId(marketId, 1);
    expect(r0).not.toBe(r1);
  });
});

describe("getNegRiskPositionId", () => {
  it("produces a valid bigint", () => {
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const result = getNegRiskPositionId(marketId, 0, 0);
    expect(typeof result).toBe("bigint");
  });

  it("produces different results for different outcome indices", () => {
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    const r0 = getNegRiskPositionId(marketId, 0, 0);
    const r1 = getNegRiskPositionId(marketId, 0, 1);
    expect(r0).not.toBe(r1);
  });
});

describe("indexSetContains", () => {
  it("returns true when bit is set", () => {
    // 7n = 0b111, bits 0, 1, 2 are set
    expect(indexSetContains(7n, 0)).toBe(true);
    expect(indexSetContains(7n, 1)).toBe(true);
    expect(indexSetContains(7n, 2)).toBe(true);
  });

  it("returns false when bit is not set", () => {
    expect(indexSetContains(7n, 3)).toBe(false);
  });

  it("returns false for 0n indexSet", () => {
    expect(indexSetContains(0n, 0)).toBe(false);
  });

  it("works with higher bit positions", () => {
    // 1n << 10n = 1024n
    expect(indexSetContains(1024n, 10)).toBe(true);
    expect(indexSetContains(1024n, 9)).toBe(false);
  });
});

describe("getEventKey", () => {
  it("joins chainId, blockNumber, logIndex with underscores", () => {
    expect(getEventKey(137, 12345, 7)).toBe("137_12345_7");
  });

  it("handles zero values", () => {
    expect(getEventKey(0, 0, 0)).toBe("0_0_0");
  });
});
