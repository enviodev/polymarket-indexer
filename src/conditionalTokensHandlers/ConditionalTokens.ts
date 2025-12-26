import { ConditionalTokens, type HandlerContext } from "generated";

const GLOBAL_OPEN_INTEREST_ID = "GlobalOpenInterest";

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
  await updateGlobalOpenInterest(amount, context);
  await updateMarketOpenInterest(amount, conditionId, context);
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
  await updateGlobalOpenInterest(-amount, context);
  await updateMarketOpenInterest(-amount, conditionId, context);
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
  await updateGlobalOpenInterest(-payout, context);
  await updateMarketOpenInterest(-payout, conditionId, context);
});

ConditionalTokens.ConditionPreparation.handler(async ({ event, context }) => {
  const { outcomeSlotCount, conditionId } = event.params;

  if (outcomeSlotCount != 2n) return;

  context.Condition.set({
    id: conditionId,
  });
});

async function updateMarketOpenInterest(
  amount: bigint,
  conditionId: string,
  context: HandlerContext
) {
  let marketOpenInterest = await context.MarketOpenInterest.getOrCreate({
    id: conditionId,
    amount: 0n,
  });

  marketOpenInterest = {
    ...marketOpenInterest,
    amount: marketOpenInterest.amount + amount,
  };

  context.MarketOpenInterest.set(marketOpenInterest);
}

async function updateGlobalOpenInterest(
  amount: bigint,
  context: HandlerContext
) {
  let globalOpenInterest = await context.GlobalOpenInterest.getOrCreate({
    id: GLOBAL_OPEN_INTEREST_ID,
    amount: 0n,
  });

  globalOpenInterest = {
    ...globalOpenInterest,
    amount: globalOpenInterest.amount + amount,
  };

  context.GlobalOpenInterest.set(globalOpenInterest);
}
