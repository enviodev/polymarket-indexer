import { COLLATERAL_SCALE } from "./constants.js";

export function getUserPositionEntityId(
  user: string,
  tokenId: bigint,
): string {
  return `${user}-${tokenId.toString()}`;
}

export async function loadOrCreateUserPosition(
  context: any,
  user: string,
  tokenId: bigint,
): Promise<{
  id: string;
  user: string;
  tokenId: bigint;
  amount: bigint;
  avgPrice: bigint;
  realizedPnl: bigint;
  totalBought: bigint;
}> {
  const id = getUserPositionEntityId(user, tokenId);
  const existing = await context.UserPosition.get(id);
  if (existing) return existing;
  return {
    id,
    user,
    tokenId,
    amount: 0n,
    avgPrice: 0n,
    realizedPnl: 0n,
    totalBought: 0n,
  };
}

export async function updateUserPositionWithBuy(
  context: any,
  user: string,
  positionId: bigint,
  price: bigint,
  amount: bigint,
): Promise<void> {
  if (amount <= 0n) return;

  const userPosition = await loadOrCreateUserPosition(context, user, positionId);

  // avgPrice = (avgPrice * userAmount + price * buyAmount) / (userAmount + buyAmount)
  const numerator = userPosition.avgPrice * userPosition.amount + price * amount;
  const denominator = userPosition.amount + amount;
  const newAvgPrice = denominator > 0n ? numerator / denominator : 0n;

  context.UserPosition.set({
    ...userPosition,
    avgPrice: newAvgPrice,
    amount: userPosition.amount + amount,
    totalBought: userPosition.totalBought + amount,
  });
}

export async function updateUserPositionWithSell(
  context: any,
  user: string,
  positionId: bigint,
  price: bigint,
  amount: bigint,
): Promise<void> {
  const userPosition = await loadOrCreateUserPosition(context, user, positionId);

  // Cap at current position amount
  const adjustedAmount = amount > userPosition.amount ? userPosition.amount : amount;

  // realizedPnl += adjustedAmount * (price - avgPrice) / COLLATERAL_SCALE
  const deltaPnL = (adjustedAmount * (price - userPosition.avgPrice)) / COLLATERAL_SCALE;

  context.UserPosition.set({
    ...userPosition,
    realizedPnl: userPosition.realizedPnl + deltaPnL,
    amount: userPosition.amount - adjustedAmount,
  });
}

/**
 * Parse OrderFilled event into a PnL-relevant order structure.
 * The maker is always the user (taker is the exchange).
 */
export function parseOrderFilled(params: {
  makerAssetId: bigint;
  takerAssetId: bigint;
  makerAmountFilled: bigint;
  takerAmountFilled: bigint;
  maker: string;
}): {
  account: string;
  side: "BUY" | "SELL";
  baseAmount: bigint;
  quoteAmount: bigint;
  positionId: bigint;
} {
  const isBuy = params.makerAssetId === 0n;

  if (isBuy) {
    return {
      account: params.maker,
      side: "BUY",
      baseAmount: params.takerAmountFilled,
      quoteAmount: params.makerAmountFilled,
      positionId: params.takerAssetId,
    };
  } else {
    return {
      account: params.maker,
      side: "SELL",
      baseAmount: params.makerAmountFilled,
      quoteAmount: params.takerAmountFilled,
      positionId: params.makerAssetId,
    };
  }
}

/**
 * Compute FPMM price from outcome token amounts.
 * price[i] = amounts[1-i] * COLLATERAL_SCALE / (amounts[0] + amounts[1])
 */
export function computeFpmmPrice(amounts: bigint[], outcomeIndex: number): bigint {
  const total = amounts[0]! + amounts[1]!;
  if (total === 0n) return 0n;
  return (amounts[1 - outcomeIndex]! * COLLATERAL_SCALE) / total;
}

/**
 * Compute neg-risk YES price from average NO price.
 * yesPrice = (noPrice * noCount - COLLATERAL_SCALE * (noCount - 1)) / (questionCount - noCount)
 */
export function computeNegRiskYesPrice(
  noPrice: bigint,
  noCount: number,
  questionCount: number,
): bigint {
  const yesCount = questionCount - noCount;
  if (yesCount === 0) return 0n;
  return (
    noPrice * BigInt(noCount) -
    COLLATERAL_SCALE * BigInt(noCount - 1)
  ) / BigInt(yesCount);
}
