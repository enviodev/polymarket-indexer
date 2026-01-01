import { NegRiskAdapter } from "generated";
import {
  getConditionId,
  getNegRiskConditionId,
  getNegRiskQuestionId,
  indexSetContains,
  updateGlobalOpenInterest,
  updateMarketOpenInterest,
  updateOpenInterest,
} from "./utils";

NegRiskAdapter.PositionSplit.handler(async ({ event, context }) => {
  const { amount, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) return;

  // update open interest, this split increases the open interest
  await updateOpenInterest(amount, conditionId, context);
});

NegRiskAdapter.PositionsMerge.handler(async ({ event, context }) => {
  const { amount, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) return;

  // update open interest, this merge decreases the open interest
  await updateOpenInterest(-amount, conditionId, context);
});

NegRiskAdapter.PayoutRedemption.handler(async ({ event, context }) => {
  const { payout, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) return;

  // update open interest, this redemption decreases the open interest
  await updateOpenInterest(-payout, conditionId, context);
});

NegRiskAdapter.MarketPrepared.handler(async ({ event, context }) => {
  context.NegRiskEvent.set({
    id: event.params.marketId,
    questionCount: 0,
    feeBps: event.params.feeBips,
  });
});

NegRiskAdapter.QuestionPrepared.handler(async ({ event, context }) => {
  const negRiskEvent = await context.NegRiskEvent.get(event.params.marketId);
  if (!negRiskEvent) return;

  context.NegRiskEvent.set({
    ...negRiskEvent,
    questionCount: negRiskEvent.questionCount + 1,
  });
});

NegRiskAdapter.PositionsConverted.handler(async ({ event, context }) => {
  const { marketId, indexSet } = event.params;

  const negRiskEvent = await context.NegRiskEvent.get(marketId);
  if (!negRiskEvent) return;

  const questionCount = negRiskEvent.questionCount;

  let conditionIds: string[] = [];

  for (let i = 0; i < questionCount; i++) {
    if (indexSetContains(indexSet, i)) {
      conditionIds.push(getNegRiskConditionId(marketId as `0x${string}`, i));
    }
  }

  let noCount = conditionIds.length;
  if (noCount > 1) {
    let amount = event.params.amount;
    let feeAmount = 0n;
    let multiplier = BigInt(noCount - 1);
    let divisor = BigInt(noCount);

    if (negRiskEvent.feeBps > 0) {
      feeAmount = (amount * BigInt(negRiskEvent.feeBps)) / 10_000n;
      amount -= feeAmount;

      let feeReleasedToVault = -(feeAmount * multiplier);
      for (let i = 0; i < noCount; i++) {
        let conditionId = conditionIds[i];
        if (conditionId != undefined) {
          await updateMarketOpenInterest(
            feeReleasedToVault / divisor,
            conditionId,
            context
          );
        } else {
          context.log.error(
            `NegRiskAdapter.PositionsConverted: Missing conditionId for marketId ${marketId} at index ${i}`
          );
        }
      }

      await updateGlobalOpenInterest(feeAmount, context);
    }

    let collateralReleasedToUser = -(amount * multiplier);
    for (let i = 0; i < noCount; i++) {
      let conditionId = conditionIds[i];
      if (conditionId != undefined) {
        await updateMarketOpenInterest(
          collateralReleasedToUser / divisor,
          conditionId,
          context
        );
      } else {
        context.log.error(
          `NegRiskAdapter.PositionsConverted: Missing conditionId for marketId ${marketId} at index ${i}`
        );
      }
    }
    await updateGlobalOpenInterest(collateralReleasedToUser, context);
  }
});
