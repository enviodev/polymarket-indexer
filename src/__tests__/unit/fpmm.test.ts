import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import BigNumber from "bignumber.js";
import "../../handlers/FixedProductMarketMaker.js";

const FPMM_ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CONDITIONAL_TOKENS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";

function seedFpmm(indexer: ReturnType<typeof createTestIndexer>) {
  indexer.Condition.set({
    id: CONDITION_ID,
    positionIds: [100n, 101n],
    payoutNumerators: [],
    payoutDenominator: 0n,
  });
  indexer.FixedProductMarketMaker.set({
    id: FPMM_ADDR,
    creator: BUYER,
    creationTimestamp: 1_700_000_000n,
    creationTransactionHash: "0xdeadbeef",
    collateralToken: USDC,
    conditionalTokenAddress: CONDITIONAL_TOKENS,
    conditions: [CONDITION_ID],
    fee: 2_000n,
    totalSupply: 0n,
    outcomeTokenAmounts: [10_000_000n, 10_000_000n],
    outcomeTokenPrices: [new BigNumber(0.5), new BigNumber(0.5)],
    lastActiveDay: 0n,
    collateralVolume: 0n,
    scaledCollateralVolume: new BigNumber(0),
    collateralBuyVolume: 0n,
    scaledCollateralBuyVolume: new BigNumber(0),
    collateralSellVolume: 0n,
    scaledCollateralSellVolume: new BigNumber(0),
    liquidityParameter: 10_000_000n,
    scaledLiquidityParameter: new BigNumber(10),
    feeVolume: 0n,
    scaledFeeVolume: new BigNumber(0),
    tradesQuantity: 0n,
    buysQuantity: 0n,
    sellsQuantity: 0n,
    liquidityAddQuantity: 0n,
    liquidityRemoveQuantity: 0n,
    outcomeSlotCount: 2n,
  });
}

describe("FixedProductMarketMaker.FPMMBuy", () => {
  it("updates FPMM metrics and creates an FpmmTransaction on buy", async () => {
    const indexer = createTestIndexer();
    seedFpmm(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
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
    seedFpmm(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
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
    seedFpmm(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
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
