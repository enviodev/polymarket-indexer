import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/FeeModule.js";

const FEE_MODULE = "0xe3f18acc55091e2c48d883fc8c8413319d4ab7b0";
const NEG_RISK_FEE_MODULE = "0xb768891e3130f6df18214ac804d4db76c2c37730";
const REFUNDEE = "0x1111111111111111111111111111111111111111";

describe("FeeModule.FeeRefunded", () => {
  it("creates a FeeRefunded entity with negRisk=false for regular FeeModule", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "FeeModule",
              srcAddress: FEE_MODULE,
              event: "FeeRefunded",
              params: {
                orderHash:
                  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                to: REFUNDEE,
                id: 12345n,
                refund: 1000n,
                feeCharged: 500n,
              },
            },
          ],
        },
      },
    });

    const entities = await indexer.FeeRefunded.getAll();
    expect(entities.length).toBe(1);
    const e = entities[0]!;
    expect(e.tokenId).toBe("12345");
    expect(e.feeRefunded).toBe(1000n);
    expect(e.feeCharged).toBe(500n);
    expect(e.refundee.toLowerCase()).toBe(REFUNDEE);
    expect(e.negRisk).toBe(false);
  });

  it("sets negRisk=true for NegRiskFeeModule address", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "FeeModule",
              srcAddress: NEG_RISK_FEE_MODULE,
              event: "FeeRefunded",
              params: {
                orderHash:
                  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                to: REFUNDEE,
                id: 99n,
                refund: 2000n,
                feeCharged: 1000n,
              },
            },
          ],
        },
      },
    });

    const entities = await indexer.FeeRefunded.getAll();
    expect(entities.length).toBe(1);
    expect(entities[0]!.negRisk).toBe(true);
  });
});
