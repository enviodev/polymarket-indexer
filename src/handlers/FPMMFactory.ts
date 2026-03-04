import { FPMMFactory } from "generated";
import { CONDITIONAL_TOKENS } from "../utils/constants.js";
import { timestampToDay } from "../utils/fpmm.js";

const CONDITIONAL_TOKENS_LOWER = CONDITIONAL_TOKENS.toLowerCase();

// ============================================================
// contractRegister — register dynamic FPMM addresses (MUST be before handler)
// ============================================================

FPMMFactory.FixedProductMarketMakerCreation.contractRegister(
  ({ event, context }) => {
    context.addFixedProductMarketMaker(event.params.fixedProductMarketMaker);
  },
);

// ============================================================
// FixedProductMarketMakerCreation — create FPMM entity
// ============================================================

FPMMFactory.FixedProductMarketMakerCreation.handler(
  async ({ event, context }) => {
    const fpmmAddress = event.params.fixedProductMarketMaker;
    const conditionalTokensAddress =
      event.params.conditionalTokens.toLowerCase();

    // Only index FPMMs using our ConditionalTokens
    if (conditionalTokensAddress !== CONDITIONAL_TOKENS_LOWER) return;

    const conditionIds = event.params.conditionIds.map((id: string) => id);

    // Verify all conditions exist
    for (const conditionId of conditionIds) {
      const condition = await context.Condition.get(conditionId);
      if (!condition) return;
    }

    const outcomeSlotCount = 2; // Polymarket uses binary conditions

    context.FixedProductMarketMaker.set({
      id: fpmmAddress,
      creator: event.params.creator,
      creationTimestamp: BigInt(event.block.timestamp),
      creationTransactionHash: event.transaction.hash,
      collateralToken: event.params.collateralToken,
      conditionalTokenAddress: conditionalTokensAddress,
      conditions: conditionIds,
      fee: event.params.fee,
      outcomeSlotCount: BigInt(outcomeSlotCount),
      // Zero-initialized metrics
      totalSupply: 0n,
      outcomeTokenAmounts: Array(outcomeSlotCount).fill(0n),
      outcomeTokenPrices: Array(outcomeSlotCount).fill(0),
      lastActiveDay: timestampToDay(event.block.timestamp),
      collateralVolume: 0n,
      scaledCollateralVolume: 0,
      collateralBuyVolume: 0n,
      scaledCollateralBuyVolume: 0,
      collateralSellVolume: 0n,
      scaledCollateralSellVolume: 0,
      liquidityParameter: 0n,
      scaledLiquidityParameter: 0,
      feeVolume: 0n,
      scaledFeeVolume: 0,
      tradesQuantity: 0n,
      buysQuantity: 0n,
      sellsQuantity: 0n,
      liquidityAddQuantity: 0n,
      liquidityRemoveQuantity: 0n,
    });
  },
);
