import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import { getAddress } from "viem";
import { SIM_BLOCK } from "../simBlock.js";

// Checksummed: simulate normalizes srcAddress to the checksum address_format,
// and the entity id comes from the (raw) creation param — keep them identical.
const FPMM_ADDR = getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const CONDITIONAL_TOKENS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045" as `0x${string}`;
const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" as `0x${string}`;
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";
const BUYER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const SELLER = "0x2222222222222222222222222222222222222222" as `0x${string}`;
const LP_SETUP = "0x3333333333333333333333333333333333333333" as `0x${string}`;

// FixedProductMarketMaker is a dynamic contract — envio 3.7+ only routes
// simulated events for addresses actually registered, so every test runs a
// real factory creation through the pipeline as the first simulate item and
// builds pool state organically (funding events) instead of seeding entities.
function seedCondition(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.Condition.set({
    id: CONDITION_ID,
    positionIds: [100n, 101n],
    payoutNumerators: [],
    payoutDenominator: 0n,
  });
}

const creation = {
  block: SIM_BLOCK,
  contract: "FPMMFactory" as const,
  event: "FixedProductMarketMakerCreation" as const,
  params: {
    creator: BUYER,
    fixedProductMarketMaker: FPMM_ADDR,
    conditionalTokens: CONDITIONAL_TOKENS,
    collateralToken: USDC,
    conditionIds: [CONDITION_ID],
    fee: 2_000n,
  },
};

// Gives the pool [10M, 10M] outcome tokens and a 10M liquidity parameter —
// the same state the old seeded-entity fixtures used.
const setupFunding = {
  block: { number: SIM_BLOCK.number + 1 },
  contract: "FixedProductMarketMaker" as const,
  srcAddress: FPMM_ADDR,
  event: "FPMMFundingAdded" as const,
  params: {
    funder: LP_SETUP,
    amountsAdded: [10_000_000n, 10_000_000n],
    sharesMinted: 10_000_000n,
  },
};

const tradeBlock = { number: SIM_BLOCK.number + 2 };

describe("FixedProductMarketMaker.FPMMBuy", () => {
  it("updates FPMM metrics and creates an FpmmTransaction on buy", async () => {
    const indexer = createTestIndexer();
    seedCondition(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            creation,
            setupFunding,
            {
              block: tradeBlock,
              contract: "FixedProductMarketMaker",
              srcAddress: FPMM_ADDR,
              event: "FPMMBuy",
              params: {
                buyer: BUYER,
                investmentAmount: 1_000_000n,
                feeAmount: 20_000n,
                outcomeIndex: 0n,
                outcomeTokensBought: 1_800_000n,
              },
            },
          ],
        },
      },
    });

    const fpmm = await indexer.FixedProductMarketMaker.get(FPMM_ADDR);
    expect(fpmm!.tradesQuantity).toBe(1n);
    expect(fpmm!.buysQuantity).toBe(1n);
    expect(fpmm!.collateralVolume).toBe(1_000_000n);

    const tx = (await indexer.FpmmTransaction.getAll())[0]!;
    expect(tx.type).toBe("Buy");
    expect(tx.tradeAmount).toBe(1_000_000n);
  });
});

describe("FixedProductMarketMaker.FPMMSell", () => {
  it("updates FPMM metrics and creates an FpmmTransaction on sell", async () => {
    const indexer = createTestIndexer();
    seedCondition(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            creation,
            setupFunding,
            {
              block: tradeBlock,
              contract: "FixedProductMarketMaker",
              srcAddress: FPMM_ADDR,
              event: "FPMMSell",
              params: {
                seller: SELLER,
                returnAmount: 500_000n,
                feeAmount: 10_000n,
                outcomeIndex: 0n,
                outcomeTokensSold: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const fpmm = await indexer.FixedProductMarketMaker.get(FPMM_ADDR);
    expect(fpmm!.sellsQuantity).toBe(1n);
    expect(fpmm!.collateralVolume).toBe(500_000n);

    const tx = (await indexer.FpmmTransaction.getAll())[0]!;
    expect(tx.type).toBe("Sell");
  });
});

describe("FixedProductMarketMaker.FPMMFundingAdded", () => {
  it("increments liquidityAddQuantity and records funding addition", async () => {
    const indexer = createTestIndexer();
    seedCondition(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            creation,
            {
              block: tradeBlock,
              contract: "FixedProductMarketMaker",
              srcAddress: FPMM_ADDR,
              event: "FPMMFundingAdded",
              params: {
                funder: BUYER,
                amountsAdded: [1_000_000n, 1_000_000n],
                sharesMinted: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const fpmm = await indexer.FixedProductMarketMaker.get(FPMM_ADDR);
    expect(fpmm!.liquidityAddQuantity).toBe(1n);
    expect(fpmm!.totalSupply).toBe(1_000_000n);

    const additions = await indexer.FpmmFundingAddition.getAll();
    expect(additions.length).toBe(1);
    expect(additions[0]!.sharesMinted).toBe(1_000_000n);
  });
});

describe("FixedProductMarketMaker LP PnL round trip", () => {
  it("realizes zero PnL on a break-even add -> remove round trip", async () => {
    const indexer = createTestIndexer();
    seedCondition(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            creation,
            {
              block: tradeBlock,
              contract: "FixedProductMarketMaker",
              srcAddress: FPMM_ADDR,
              event: "FPMMFundingAdded",
              params: {
                funder: BUYER,
                amountsAdded: [100_000_000n, 100_000_000n],
                sharesMinted: 100_000_000n,
              },
            },
            {
              contract: "FixedProductMarketMaker",
              srcAddress: FPMM_ADDR,
              event: "FPMMFundingRemoved",
              params: {
                funder: BUYER,
                amountsRemoved: [100_000_000n, 100_000_000n],
                collateralRemovedFromFeePool: 0n,
                sharesBurnt: 100_000_000n,
              },
            },
          ],
        },
      },
    });

    // LP share position: bought 100M shares @ 1.00, sold @ 1.00 (tokens
    // received are booked separately as 0.50 buys). Break-even => 0 PnL.
    const lpPosition = await indexer.UserPosition.get(
      `${BUYER}-${BigInt(FPMM_ADDR).toString()}`,
    );
    expect(lpPosition).toBeDefined();
    expect(lpPosition!.amount).toBe(0n);
    expect(lpPosition!.realizedPnl).toBe(0n);

    // The outcome tokens received on removal are held at 0.50 basis
    for (const positionId of [100n, 101n]) {
      const pos = await indexer.UserPosition.get(`${BUYER}-${positionId}`);
      expect(pos!.amount).toBe(100_000_000n);
      expect(pos!.avgPrice).toBe(500_000n);
    }
  });
});
