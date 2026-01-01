import { ConditionalTokens, type HandlerContext } from "generated";
import { updateOpenInterest } from "./utils";

ConditionalTokens.PositionSplit.handler(async ({ event, context }) => {
  // check if condition exists if not skip it
  const { amount, collateralToken, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) return;

  // only track USDC and ignore rest which will be track in neg risk markets
  if (
    collateralToken !=
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase()
  )
    return;

  // update open interest, this split increases the open interest
  await updateOpenInterest(amount, conditionId, context);
});

ConditionalTokens.PositionsMerge.handler(async ({ event, context }) => {
  // check if condition exists if not skip it
  const { amount, collateralToken, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) return;

  // only track USDC and ignore rest which will be track in neg risk markets
  if (
    collateralToken !=
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase()
  )
    return;

  // update open interest, this merge decreases the open interest
  await updateOpenInterest(-amount, conditionId, context);
});

ConditionalTokens.PayoutRedemption.handler(async ({ event, context }) => {
  // check if condition exists if not skip it
  const { payout, collateralToken, conditionId } = event.params;
  const condition = await context.Condition.get(conditionId);

  if (!condition) return;
  // only track USDC and ignore rest which will be track in neg risk markets
  if (
    collateralToken !=
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase()
  )
    return;

  // update open interest, this redemption decreases the open interest
  await updateOpenInterest(-payout, conditionId, context);
});

ConditionalTokens.ConditionPreparation.handler(async ({ event, context }) => {
  const { outcomeSlotCount, conditionId } = event.params;

  if (outcomeSlotCount != 2n) return;

  context.Condition.set({
    id: conditionId,
  });
});
