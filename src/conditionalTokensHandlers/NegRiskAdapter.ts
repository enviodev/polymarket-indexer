import { NegRiskAdapter } from "generated";
import { updateOpenInterest } from "./utils";

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
});
