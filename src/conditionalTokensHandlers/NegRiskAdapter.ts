import { NegRiskAdapter, indexer } from "generated";
import {
  getNegRiskConditionId,
  indexSetContains,
  updateGlobalOpenInterest,
  updateMarketOpenInterest,
  updateOpenInterest,
} from "./utils";
import { getEventId } from "../common/utils/getEventId";

/**
 * @dev following event handlers combined logic from both activity and oi subgraphs for NegRiskAdapter
 */

NegRiskAdapter.PositionSplit.handler(async ({ event, context }) => {
  const { amount, conditionId, stakeholder } = event.params;

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/NegRiskAdapterMapping.ts#L21
    // track splits for all addresses except for NegRiskAdapter
    if (
      ![...indexer.chains[137].NegRiskAdapter.addresses].includes(stakeholder)
    ) {
      context.Split.set({
        id: getEventId(event.transaction.hash, event.logIndex),
        timestamp: event.block.timestamp,
        stakeholder: stakeholder,
        condition: conditionId,
        amount: amount,
      });
    }
  }

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/oi-subgraph/src/NegRiskAdapterMapping.ts#L24-L32
    // check if condition exists if not skip updating open interest
    const condition = await context.Condition.get(conditionId);
    if (!condition) return;

    // split increases the open interest
    await updateOpenInterest(amount, conditionId, context);
  }
});

NegRiskAdapter.PositionsMerge.handler(async ({ event, context }) => {
  const { amount, conditionId, stakeholder } = event.params;

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/NegRiskAdapterMapping.ts#L39
    // track merges for all addresses except for NegRiskAdapter
    if (
      ![...indexer.chains[137].NegRiskAdapter.addresses].includes(stakeholder)
    ) {
      context.Merge.set({
        id: getEventId(event.transaction.hash, event.logIndex),
        timestamp: event.block.timestamp,
        stakeholder: stakeholder,
        condition: conditionId,
        amount: amount,
      });
    }
  }

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/oi-subgraph/src/NegRiskAdapterMapping.ts#L39C1-L45C43
    // update open interest only if condition exists
    const condition = await context.Condition.get(conditionId);
    if (!condition) return;

    // merge decreases the open interest
    await updateOpenInterest(-amount, conditionId, context);
  }
});

NegRiskAdapter.PayoutRedemption.handler(async ({ event, context }) => {
  const { payout, conditionId, redeemer } = event.params;

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/NegRiskAdapterMapping.ts#L74C1-L81C1
    context.Redemption.set({
      id: getEventId(event.transaction.hash, event.logIndex),
      timestamp: event.block.timestamp,
      redeemer: redeemer,
      condition: conditionId,
      // need to figureout why indexSets is hardcoded to [1,2]
      indexSets: [1n, 2n],
      payout: payout,
    });
  }

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/oi-subgraph/src/NegRiskAdapterMapping.ts#L50C1-L59C43
    const condition = await context.Condition.get(conditionId);

    if (!condition) return;

    // update open interest, this redemption decreases the open interest
    await updateOpenInterest(-payout, conditionId, context);
  }
});

// activity subgraph permalink: https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/NegRiskAdapterMapping.ts#L83-L87
// oi-subgraph permalink: https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/oi-subgraph/src/NegRiskAdapterMapping.ts#L125C1-L130C2
NegRiskAdapter.MarketPrepared.handler(async ({ event, context }) => {
  context.NegRiskEvent.set({
    id: event.params.marketId,
    questionCount: 0,
    feeBps: event.params.feeBips,
  });
});

// activity subgraph permalink: https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/NegRiskAdapterMapping.ts#L89-L98
// oi-subgraph permalink: https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/oi-subgraph/src/NegRiskAdapterMapping.ts#L132C1-L140C2
NegRiskAdapter.QuestionPrepared.handler(async ({ event, context }) => {
  const negRiskEvent = await context.NegRiskEvent.get(event.params.marketId);
  if (!negRiskEvent) return;

  context.NegRiskEvent.set({
    ...negRiskEvent,
    questionCount: negRiskEvent.questionCount + 1,
  });
});

NegRiskAdapter.PositionsConverted.handler(async ({ event, context }) => {
  const { marketId, indexSet, amount, stakeholder } = event.params;

  const negRiskEvent = await context.NegRiskEvent.get(marketId);
  if (!negRiskEvent) return;

  {
    // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/NegRiskAdapterMapping.ts#L57
    context.NegRiskConversion.set({
      id: getEventId(event.transaction.hash, event.logIndex),
      timestamp: event.block.timestamp,
      stakeholder: stakeholder,
      negRiskMarketId: marketId,
      amount: amount,
      indexSet: indexSet,
      questionCount: negRiskEvent.questionCount,
    });
  }

  {
    //https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/oi-subgraph/src/NegRiskAdapterMapping.ts#L69C1-L123C1

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
  }
});
