import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/FPMMFactory.js";

const CONDITIONAL_TOKENS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const OTHER_CT = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";
const CREATOR = "0x1111111111111111111111111111111111111111";
const FPMM_ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("FPMMFactory.FixedProductMarketMakerCreation", () => {
  it("creates a FixedProductMarketMaker entity for valid ConditionalTokens address", async () => {
    const indexer = createTestIndexer();

    // Seed the Condition so the FPMM handler doesn't bail on the existence check
    indexer.Condition.set({
      id: CONDITION_ID,
      positionIds: [1n, 2n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "FPMMFactory",
              event: "FixedProductMarketMakerCreation",
              params: {
                creator: CREATOR,
                fixedProductMarketMaker: FPMM_ADDR,
                conditionalTokens: CONDITIONAL_TOKENS,
                collateralToken: USDC,
                conditionIds: [CONDITION_ID],
                fee: 2_000n,
              },
            },
          ],
        },
      },
    });

    const fpmm = await indexer.FixedProductMarketMaker.get(FPMM_ADDR);
    expect(fpmm).toBeDefined();
    expect(fpmm!.creator.toLowerCase()).toBe(CREATOR);
    expect(fpmm!.fee).toBe(2_000n);
    expect(fpmm!.totalSupply).toBe(0n);
    expect(fpmm!.tradesQuantity).toBe(0n);
  });

  it("skips FPMMs using a non-Polymarket ConditionalTokens address", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "FPMMFactory",
              event: "FixedProductMarketMakerCreation",
              params: {
                creator: CREATOR,
                fixedProductMarketMaker: FPMM_ADDR,
                conditionalTokens: OTHER_CT,
                collateralToken: USDC,
                conditionIds: [CONDITION_ID],
                fee: 2_000n,
              },
            },
          ],
        },
      },
    });

    const fpmm = await indexer.FixedProductMarketMaker.get(FPMM_ADDR);
    expect(fpmm).toBeUndefined();
  });

  it("skips FPMMs referencing a non-existent condition", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "FPMMFactory",
              event: "FixedProductMarketMakerCreation",
              params: {
                creator: CREATOR,
                fixedProductMarketMaker: FPMM_ADDR,
                conditionalTokens: CONDITIONAL_TOKENS,
                collateralToken: USDC,
                conditionIds: [CONDITION_ID],
                fee: 2_000n,
              },
            },
          ],
        },
      },
    });

    const fpmm = await indexer.FixedProductMarketMaker.get(FPMM_ADDR);
    expect(fpmm).toBeUndefined();
  });
});
