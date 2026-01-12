import { ConditionalTokens, type HandlerContext } from "generated";
import { updateOpenInterest } from "./utils";
import { indexer } from "generated";
import { getEventId } from "../common/utils/getEventId";
import { getPositionId } from "../common/utils/getPositionId";

ConditionalTokens.PositionSplit.handler(async ({ event, context }) => {
  // check if condition exists if not skip it
  const { amount, collateralToken, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) {
    context.log.error(
      `Failed to update market position: condition ${conditionId} not found`
    );
    return;
  }

  // only track USDC and ignore rest which will be track in neg risk markets
  if (collateralToken == indexer.chains[137].USDC.addresses[0]) {
    // update open interest, this split increases the open interest
    await updateOpenInterest(amount, conditionId, context);
  }

  // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/ConditionalTokensMapping.ts#L20-L55
  const stakeholder = event.params.stakeholder;
  const fpmm = await context.FixedProductMarketMaker.get(stakeholder);

  // don't track merges within the market makers
  if (fpmm != undefined) return;
  // don't track merges from neg risk adapter and exchange
  // neg risk adpater merges are tracked in it's own handler
  if (
    [
      ...indexer.chains[137].NegRiskAdapter.addresses,
      ...indexer.chains[137].Exchange.addresses,
    ].includes(stakeholder)
  )
    return;
  // update split entity
  context.Split.set({
    id: getEventId(event.transaction.hash, event.logIndex),
    timestamp: event.block.timestamp,
    stakeholder: stakeholder,
    condition: conditionId,
    amount: event.params.amount,
  });
});

ConditionalTokens.PositionsMerge.handler(async ({ event, context }) => {
  // check if condition exists if not skip it
  const { amount, collateralToken, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) {
    context.log.error(
      `Failed to update market position: condition ${conditionId} not found`
    );
    return;
  }

  // only track USDC and ignore rest which will be track in neg risk markets
  if (collateralToken == indexer.chains[137].USDC.addresses[0]) {
    // update open interest, this merge decreases the open interest
    await updateOpenInterest(-amount, conditionId, context);
  }

  // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/ConditionalTokensMapping.ts#L57-L92
  const stakeholder = event.params.stakeholder;
  const fpmm = await context.FixedProductMarketMaker.get(stakeholder);

  // don't track merges within the market makers
  if (fpmm != undefined) return;
  // don't track merges from neg risk adapter and exchange
  // neg risk adpater merges are tracked in it's own handler
  if (
    [
      ...indexer.chains[137].NegRiskAdapter.addresses,
      ...indexer.chains[137].Exchange.addresses,
    ].includes(stakeholder)
  )
    return;

  context.Merge.set({
    id: getEventId(event.transaction.hash, event.logIndex),
    timestamp: event.block.timestamp,
    stakeholder: stakeholder,
    condition: conditionId,
    amount: event.params.amount,
  });
});

ConditionalTokens.PayoutRedemption.handler(async ({ event, context }) => {
  // check if condition exists if not skip it
  const { payout, collateralToken, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) {
    context.log.error(
      `Failed to update market position: condition ${conditionId} not found`
    );
    return;
  }
  // only track USDC and ignore rest which will be track in neg risk markets
  if (collateralToken == indexer.chains[137].USDC.addresses[0]) {
    // update open interest, this redemption decreases the open interest
    await updateOpenInterest(-payout, conditionId, context);
  }

  // https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/ConditionalTokensMapping.ts#L94-L122
  // note: we are checking if condition exists in the starting part of the handler
  if (
    [...indexer.chains[137].NegRiskAdapter.addresses].includes(
      event.params.redeemer
    )
  )
    return;

  context.Redemption.set({
    id: getEventId(event.transaction.hash, event.logIndex),
    timestamp: event.block.timestamp,
    redeemer: event.params.redeemer,
    condition: conditionId,
    indexSets: event.params.indexSets,
    payout: event.params.payout,
  });
});

// Activity Subgraph: https://github.com/Polymarket/polymarket-subgraph/blob/7a92ba026a9466c07381e0d245a323ba23ee8701/activity-subgraph/src/ConditionalTokensMapping.ts#L124-L154
ConditionalTokens.ConditionPreparation.handler(async ({ event, context }) => {
  const { outcomeSlotCount, conditionId } = event.params;

  if (outcomeSlotCount != 2n) return;

  context.Condition.set({
    id: conditionId,
  });

  // following part is extra in activity subgraph and not present in Open Interest subgraph
  const negRisk =
    event.params.oracle == indexer.chains[137].NegRiskAdapter.addresses[0];

  for (let i = 0; i < 2; i++) {
    const positionId = getPositionId(
      conditionId as `0x${string}`,
      i,
      negRisk
    ).toString();

    const position = await context.Position.get(positionId);
    if (position == undefined) {
      context.Position.set({
        id: positionId,
        condition: conditionId,
        outcomeIndex: BigInt(i),
      });
    }
  }
});
