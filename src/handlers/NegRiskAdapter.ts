import { NegRiskAdapter } from "generated";
import {
  NEG_RISK_ADAPTER,
  NEG_RISK_EXCHANGE,
  COLLATERAL_SCALE,
  FIFTY_CENTS,
} from "../utils/constants.js";
import {
  getEventKey,
  getNegRiskQuestionId,
  getConditionId,
  getNegRiskPositionId,
  indexSetContains,
} from "../utils/negRisk.js";
import {
  updateUserPositionWithBuy,
  updateUserPositionWithSell,
  loadOrCreateUserPosition,
  computeNegRiskYesPrice,
} from "../utils/pnl.js";

const NEG_RISK_EXCHANGE_LOWER = NEG_RISK_EXCHANGE.toLowerCase();
const FEE_DENOMINATOR = 10_000n;
const YES_INDEX = 0;
const NO_INDEX = 1;

// ============================================================
// Helper: get or create OI entities
// ============================================================

async function getOrCreateMarketOI(
  context: any,
  conditionId: string,
): Promise<{ id: string; amount: bigint }> {
  const existing = await context.MarketOpenInterest.get(conditionId);
  if (existing) return existing;
  return { id: conditionId, amount: 0n };
}

async function getOrCreateGlobalOI(
  context: any,
): Promise<{ id: string; amount: bigint }> {
  const existing = await context.GlobalOpenInterest.get("");
  if (existing) return existing;
  return { id: "", amount: 0n };
}

async function updateMarketOI(
  context: any,
  conditionId: string,
  amount: bigint,
): Promise<void> {
  const marketOI = await getOrCreateMarketOI(context, conditionId);
  context.MarketOpenInterest.set({
    ...marketOI,
    amount: marketOI.amount + amount,
  });
}

async function updateGlobalOI(
  context: any,
  amount: bigint,
): Promise<void> {
  const globalOI = await getOrCreateGlobalOI(context);
  context.GlobalOpenInterest.set({
    ...globalOI,
    amount: globalOI.amount + amount,
  });
}

async function updateOpenInterest(
  context: any,
  conditionId: string,
  amount: bigint,
): Promise<void> {
  await updateMarketOI(context, conditionId, amount);
  await updateGlobalOI(context, amount);
}

// ============================================================
// MarketPrepared — create NegRiskEvent
// ============================================================

NegRiskAdapter.MarketPrepared.handler(async ({ event, context }) => {
  context.NegRiskEvent.set({
    id: event.params.marketId,
    feeBps: event.params.feeBips,
    questionCount: 0n,
  });
});

// ============================================================
// QuestionPrepared — increment NegRiskEvent questionCount
// ============================================================

NegRiskAdapter.QuestionPrepared.handler(async ({ event, context }) => {
  const negRiskEvent = await context.NegRiskEvent.get(event.params.marketId);
  if (!negRiskEvent) return;

  context.NegRiskEvent.set({
    ...negRiskEvent,
    questionCount: negRiskEvent.questionCount + 1n,
  });
});

// ============================================================
// PositionSplit — Activity + OI + PnL
// ============================================================

NegRiskAdapter.PositionSplit.handler(async ({ event, context }) => {
  const conditionId = event.params.conditionId;
  const stakeholder = event.params.stakeholder;
  const skipExchange = stakeholder.toLowerCase() === NEG_RISK_EXCHANGE_LOWER;

  // OI: Check condition exists
  const condition = await context.Condition.get(conditionId);
  if (condition) {
    await updateOpenInterest(context, conditionId, event.params.amount);
  }

  // Activity: Create Split (skip NegRiskExchange)
  if (!skipExchange) {
    context.Split.set({
      id: getEventKey(event.chainId, event.block.number, event.logIndex),
      timestamp: BigInt(event.block.timestamp),
      stakeholder,
      condition: conditionId,
      amount: event.params.amount,
    });
  }

  // PnL: Split = buying both outcomes at 50 cents each (skip NegRiskExchange)
  if (!skipExchange && condition) {
    const positionIds = condition.positionIds;
    for (let i = 0; i < 2; i++) {
      await updateUserPositionWithBuy(
        context,
        stakeholder,
        positionIds[i]!,
        FIFTY_CENTS,
        event.params.amount,
      );
    }
  }
});

// ============================================================
// PositionsMerge — Activity + OI + PnL
// ============================================================

NegRiskAdapter.PositionsMerge.handler(async ({ event, context }) => {
  const conditionId = event.params.conditionId;
  const stakeholder = event.params.stakeholder;
  const skipExchange = stakeholder.toLowerCase() === NEG_RISK_EXCHANGE_LOWER;

  // OI: Check condition exists
  const condition = await context.Condition.get(conditionId);
  if (condition) {
    await updateOpenInterest(context, conditionId, -event.params.amount);
  }

  // Activity: Create Merge (skip NegRiskExchange)
  if (!skipExchange) {
    context.Merge.set({
      id: getEventKey(event.chainId, event.block.number, event.logIndex),
      timestamp: BigInt(event.block.timestamp),
      stakeholder,
      condition: conditionId,
      amount: event.params.amount,
    });
  }

  // PnL: Merge = selling both outcomes at 50 cents each (skip NegRiskExchange)
  if (!skipExchange && condition) {
    const positionIds = condition.positionIds;
    for (let i = 0; i < 2; i++) {
      await updateUserPositionWithSell(
        context,
        stakeholder,
        positionIds[i]!,
        FIFTY_CENTS,
        event.params.amount,
      );
    }
  }
});

// ============================================================
// PayoutRedemption — Activity + OI + PnL
// ============================================================

NegRiskAdapter.PayoutRedemption.handler(async ({ event, context }) => {
  const conditionId = event.params.conditionId;

  // OI: Check condition exists
  const condition = await context.Condition.get(conditionId);
  if (condition) {
    await updateOpenInterest(context, conditionId, -event.params.payout);
  }

  // Activity: Create Redemption with default indexSets for binary
  context.Redemption.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    timestamp: BigInt(event.block.timestamp),
    redeemer: event.params.redeemer,
    condition: conditionId,
    indexSets: [1n, 2n],
    payout: event.params.payout,
  });

  // PnL: Sell at payout price for each outcome
  if (condition && condition.payoutDenominator > 0n) {
    const payoutNumerators = condition.payoutNumerators;
    const payoutDenominator = condition.payoutDenominator;
    const positionIds = condition.positionIds;

    for (let i = 0; i < 2; i++) {
      const amount = event.params.amounts[i]!;
      const price =
        (payoutNumerators[i]! * COLLATERAL_SCALE) / payoutDenominator;
      await updateUserPositionWithSell(
        context,
        event.params.redeemer,
        positionIds[i]!,
        price,
        amount,
      );
    }
  }
});

// ============================================================
// PositionsConverted — Activity + OI + PnL
// ============================================================

NegRiskAdapter.PositionsConverted.handler(async ({ event, context }) => {
  const marketId = event.params.marketId;
  const negRiskEvent = await context.NegRiskEvent.get(marketId);
  if (!negRiskEvent) return;

  const questionCount = Number(negRiskEvent.questionCount);
  const indexSet = event.params.indexSet;
  const stakeholder = event.params.stakeholder;

  // Activity: Create NegRiskConversion
  context.NegRiskConversion.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    timestamp: BigInt(event.block.timestamp),
    stakeholder,
    negRiskMarketId: marketId,
    amount: event.params.amount,
    indexSet,
    questionCount: negRiskEvent.questionCount,
  });

  // Collect condition IDs for positions being converted
  const conditionIds: string[] = [];
  for (let qi = 0; qi < questionCount; qi++) {
    if (indexSetContains(indexSet, qi)) {
      const questionId = getNegRiskQuestionId(
        marketId as `0x${string}`,
        qi,
      );
      const conditionId = getConditionId(
        NEG_RISK_ADAPTER as `0x${string}`,
        questionId,
      ).toLowerCase();
      conditionIds.push(conditionId);
    }
  }

  // OI: Converts reduce OI when more than 1 no position
  const noCount = conditionIds.length;
  if (noCount > 1) {
    let amount = event.params.amount;
    const multiplier = BigInt(noCount - 1);
    const divisor = BigInt(noCount);

    if (negRiskEvent.feeBps > 0n) {
      const feeAmount = (amount * negRiskEvent.feeBps) / FEE_DENOMINATOR;
      amount = amount - feeAmount;

      const feeReleased = -(feeAmount * multiplier);
      for (let i = 0; i < noCount; i++) {
        await updateMarketOI(context, conditionIds[i]!, feeReleased / divisor);
      }
      await updateGlobalOI(context, feeReleased);
    }

    const collateralReleased = -(amount * multiplier);
    for (let i = 0; i < noCount; i++) {
      await updateMarketOI(
        context,
        conditionIds[i]!,
        collateralReleased / divisor,
      );
    }
    await updateGlobalOI(context, collateralReleased);
  }

  // PnL: Sell NO positions, buy YES positions
  let noPriceSum = 0n;
  let noCountPnl = 0;

  for (let qi = 0; qi < questionCount; qi++) {
    if (indexSetContains(indexSet, qi)) {
      noCountPnl++;
      const noPositionId = getNegRiskPositionId(
        marketId as `0x${string}`,
        qi,
        NO_INDEX,
      );
      const userPosition = await loadOrCreateUserPosition(
        context,
        stakeholder,
        noPositionId,
      );

      // Sell NO token at avg price
      await updateUserPositionWithSell(
        context,
        stakeholder,
        noPositionId,
        userPosition.avgPrice,
        event.params.amount,
      );

      noPriceSum += userPosition.avgPrice;
    }
  }

  // Buy YES tokens if not all positions are NO
  if (noCountPnl < questionCount && noCountPnl > 0) {
    const noPrice = noPriceSum / BigInt(noCountPnl);
    const yesPrice = computeNegRiskYesPrice(noPrice, noCountPnl, questionCount);

    for (let qi = 0; qi < questionCount; qi++) {
      if (!indexSetContains(indexSet, qi)) {
        const yesPositionId = getNegRiskPositionId(
          marketId as `0x${string}`,
          qi,
          YES_INDEX,
        );
        await updateUserPositionWithBuy(
          context,
          stakeholder,
          yesPositionId,
          yesPrice,
          event.params.amount,
        );
      }
    }
  }
});
