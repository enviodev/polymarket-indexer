import { indexer } from "envio";
import { COLLATERAL_SCALE } from "../utils/constants.js";
import {
  nthRoot,
  calculatePrices,
  scaleBigInt,
  maxBigInt,
  timestampToDay,
  ADDRESS_ZERO,
} from "../utils/fpmm.js";
import {
  updateUserPositionWithBuy,
  updateUserPositionWithSell,
  computeFpmmPrice,
} from "../utils/pnl.js";
import { getEventKey } from "../utils/negRisk.js";
import { recordUserTrade } from "../utils/stats.js";

const COLLATERAL_SCALE_DEC = 1_000_000;

// ============================================================
// Helper: load pool membership
// ============================================================

async function loadPoolMembership(
  context: any,
  poolId: string,
  funder: string,
): Promise<{ id: string; pool_id: string; funder: string; amount: bigint }> {
  const id = `${poolId}-${funder}`;
  const existing = await context.FpmmPoolMembership.get(id);
  if (existing) return existing;
  return { id, pool_id: poolId, funder, amount: 0n };
}

// ============================================================
// FPMMBuy — FPMM metrics + PnL + transaction record
// ============================================================

indexer.onEvent(
  { contract: "FixedProductMarketMaker", event: "FPMMBuy" },
  async ({ event, context }) => {
  const fpmmAddress = event.srcAddress;
  const fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
  if (!fpmm) return;

  // Update outcome token amounts
  const oldAmounts = fpmm.outcomeTokenAmounts;
  const investmentMinusFees =
    event.params.investmentAmount - event.params.feeAmount;
  const outcomeIndex = Number(event.params.outcomeIndex);

  const newAmounts: bigint[] = [];
  let amountsProduct = 1n;
  for (let i = 0; i < oldAmounts.length; i++) {
    let newAmt: bigint;
    if (i === outcomeIndex) {
      newAmt =
        oldAmounts[i]! + investmentMinusFees - event.params.outcomeTokensBought;
    } else {
      newAmt = oldAmounts[i]! + investmentMinusFees;
    }
    newAmounts.push(newAmt);
    amountsProduct *= newAmt;
  }

  const liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  const newVolume = fpmm.collateralVolume + event.params.investmentAmount;
  const newBuyVol = fpmm.collateralBuyVolume + event.params.investmentAmount;
  const newFeeVol = fpmm.feeVolume + event.params.feeAmount;

  context.FixedProductMarketMaker.set({
    ...fpmm,
    outcomeTokenAmounts: newAmounts,
    outcomeTokenPrices: calculatePrices(newAmounts),
    liquidityParameter,
    scaledLiquidityParameter: scaleBigInt(liquidityParameter),
    collateralVolume: newVolume,
    scaledCollateralVolume: scaleBigInt(newVolume),
    collateralBuyVolume: newBuyVol,
    scaledCollateralBuyVolume: scaleBigInt(newBuyVol),
    feeVolume: newFeeVol,
    scaledFeeVolume: scaleBigInt(newFeeVol),
    lastActiveDay: timestampToDay(event.block.timestamp),
    tradesQuantity: fpmm.tradesQuantity + 1n,
    buysQuantity: fpmm.buysQuantity + 1n,
  });

  // Record transaction
  context.FpmmTransaction.set({
    id: getEventKey(event.block.number, event.logIndex),
    type: "Buy",
    timestamp: event.block.timestamp,
    market_id: fpmmAddress,
    user: event.params.buyer,
    tradeAmount: event.params.investmentAmount,
    feeAmount: event.params.feeAmount,
    outcomeIndex: event.params.outcomeIndex,
    outcomeTokensAmount: event.params.outcomeTokensBought,
  });

  // PnL: Buy outcome token
  if (event.params.outcomeTokensBought > 0n) {
    const price =
      (event.params.investmentAmount * COLLATERAL_SCALE) /
      event.params.outcomeTokensBought;

    // Look up condition from FPMM
    const conditionId = fpmm.conditions[0];
    if (conditionId) {
      const condition = await context.Condition.get(conditionId);
      if (condition) {
        const positionId = condition.positionIds[outcomeIndex];
        if (positionId !== undefined) {
          await updateUserPositionWithBuy(
            context,
            event.params.buyer,
            positionId,
            price,
            event.params.outcomeTokensBought,
          );
        }
      }
    }
  }

  // Per-user rollup (buyer pays investmentAmount in collateral)
  await recordUserTrade(
    context,
    event.params.buyer,
    event.params.investmentAmount,
    event.params.feeAmount,
    event.block.timestamp,
  );
  },
);

// ============================================================
// FPMMSell — FPMM metrics + PnL + transaction record
// ============================================================

indexer.onEvent(
  { contract: "FixedProductMarketMaker", event: "FPMMSell" },
  async ({ event, context }) => {
  const fpmmAddress = event.srcAddress;
  const fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
  if (!fpmm) return;

  // Update outcome token amounts
  const oldAmounts = fpmm.outcomeTokenAmounts;
  const returnPlusFees = event.params.returnAmount + event.params.feeAmount;
  const outcomeIndex = Number(event.params.outcomeIndex);

  const newAmounts: bigint[] = [];
  let amountsProduct = 1n;
  for (let i = 0; i < oldAmounts.length; i++) {
    let newAmt: bigint;
    if (i === outcomeIndex) {
      newAmt =
        oldAmounts[i]! - returnPlusFees + event.params.outcomeTokensSold;
    } else {
      newAmt = oldAmounts[i]! - returnPlusFees;
    }
    newAmounts.push(newAmt);
    amountsProduct *= newAmt;
  }

  const liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  const newVolume = fpmm.collateralVolume + event.params.returnAmount;
  const newSellVol = fpmm.collateralSellVolume + event.params.returnAmount;
  const newFeeVol = fpmm.feeVolume + event.params.feeAmount;

  context.FixedProductMarketMaker.set({
    ...fpmm,
    outcomeTokenAmounts: newAmounts,
    outcomeTokenPrices: calculatePrices(newAmounts),
    liquidityParameter,
    scaledLiquidityParameter: scaleBigInt(liquidityParameter),
    collateralVolume: newVolume,
    scaledCollateralVolume: scaleBigInt(newVolume),
    collateralSellVolume: newSellVol,
    scaledCollateralSellVolume: scaleBigInt(newSellVol),
    feeVolume: newFeeVol,
    scaledFeeVolume: scaleBigInt(newFeeVol),
    lastActiveDay: timestampToDay(event.block.timestamp),
    tradesQuantity: fpmm.tradesQuantity + 1n,
    sellsQuantity: fpmm.sellsQuantity + 1n,
  });

  // Record transaction
  context.FpmmTransaction.set({
    id: getEventKey(event.block.number, event.logIndex),
    type: "Sell",
    timestamp: event.block.timestamp,
    market_id: fpmmAddress,
    user: event.params.seller,
    tradeAmount: event.params.returnAmount,
    feeAmount: event.params.feeAmount,
    outcomeIndex: event.params.outcomeIndex,
    outcomeTokensAmount: event.params.outcomeTokensSold,
  });

  // PnL: Sell outcome token
  if (event.params.outcomeTokensSold > 0n) {
    const price =
      (event.params.returnAmount * COLLATERAL_SCALE) /
      event.params.outcomeTokensSold;

    const conditionId = fpmm.conditions[0];
    if (conditionId) {
      const condition = await context.Condition.get(conditionId);
      if (condition) {
        const positionId = condition.positionIds[outcomeIndex];
        if (positionId !== undefined) {
          await updateUserPositionWithSell(
            context,
            event.params.seller,
            positionId,
            price,
            event.params.outcomeTokensSold,
          );
        }
      }
    }
  }

  // Per-user rollup (seller receives returnAmount in collateral)
  await recordUserTrade(
    context,
    event.params.seller,
    event.params.returnAmount,
    event.params.feeAmount,
    event.block.timestamp,
  );
  },
);

// ============================================================
// FPMMFundingAdded — FPMM metrics + PnL + record
// ============================================================

indexer.onEvent(
  { contract: "FixedProductMarketMaker", event: "FPMMFundingAdded" },
  async ({ event, context }) => {
  const fpmmAddress = event.srcAddress;
  const fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
  if (!fpmm) return;

  // Update outcome token amounts
  const oldAmounts = fpmm.outcomeTokenAmounts;
  const amountsAdded = event.params.amountsAdded;
  const newAmounts: bigint[] = [];
  let amountsProduct = 1n;
  for (let i = 0; i < oldAmounts.length; i++) {
    const newAmt = oldAmounts[i]! + (amountsAdded[i] ?? 0n);
    newAmounts.push(newAmt);
    amountsProduct *= newAmt;
  }

  const liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  const newTotalSupply = fpmm.totalSupply + event.params.sharesMinted;

  // Update prices only on first liquidity addition
  const newPrices =
    fpmm.totalSupply === 0n
      ? calculatePrices(newAmounts)
      : fpmm.outcomeTokenPrices;

  context.FixedProductMarketMaker.set({
    ...fpmm,
    outcomeTokenAmounts: newAmounts,
    outcomeTokenPrices: newPrices,
    liquidityParameter,
    scaledLiquidityParameter: scaleBigInt(liquidityParameter),
    totalSupply: newTotalSupply,
    liquidityAddQuantity: fpmm.liquidityAddQuantity + 1n,
  });

  // Compute amountsRefunded
  const addedFunds = maxBigInt(amountsAdded);
  const amountsRefunded: bigint[] = [];
  for (let i = 0; i < amountsAdded.length; i++) {
    amountsRefunded.push(addedFunds - (amountsAdded[i] ?? 0n));
  }

  // Record funding addition
  context.FpmmFundingAddition.set({
    id: getEventKey(event.block.number, event.logIndex),
    timestamp: event.block.timestamp,
    fpmm_id: fpmmAddress,
    funder: event.params.funder,
    amountsAdded: amountsAdded.map((v: bigint) => v),
    amountsRefunded,
    sharesMinted: event.params.sharesMinted,
  });

  // PnL: Funding added = buy sendback token + buy LP shares
  const conditionId = fpmm.conditions[0];
  if (!conditionId) return;
  const condition = await context.Condition.get(conditionId);
  if (!condition) return;

  const totalAdded = (amountsAdded[0] ?? 0n) + (amountsAdded[1] ?? 0n);
  if (totalAdded === 0n) return;

  // Sendback: the cheaper outcome gets refunded to the user
  const outcomeIndex =
    (amountsAdded[0] ?? 0n) > (amountsAdded[1] ?? 0n) ? 1 : 0;
  const sendbackAmount =
    (amountsAdded[1 - outcomeIndex] ?? 0n) - (amountsAdded[outcomeIndex] ?? 0n);

  let tokenCost = 0n;
  if (sendbackAmount > 0n) {
    const sendbackPrice = computeFpmmPrice(amountsAdded, outcomeIndex);
    const positionId = condition.positionIds[outcomeIndex];
    if (positionId !== undefined) {
      await updateUserPositionWithBuy(
        context,
        event.params.funder,
        positionId,
        sendbackPrice,
        sendbackAmount,
      );
    }
    tokenCost = (sendbackAmount * sendbackPrice) / COLLATERAL_SCALE;
  }

  // Buy LP shares (always tracked, even for balanced additions)
  if (event.params.sharesMinted > 0n) {
    const totalUSDCSpend = maxBigInt(amountsAdded);
    const lpShareCost = totalUSDCSpend - tokenCost;
    const lpSharePrice =
      (lpShareCost * COLLATERAL_SCALE) / event.params.sharesMinted;

    const fpmmAsBigInt = BigInt(fpmmAddress);
    await updateUserPositionWithBuy(
      context,
      event.params.funder,
      fpmmAsBigInt,
      lpSharePrice,
      event.params.sharesMinted,
    );
  }
  },
);

// ============================================================
// FPMMFundingRemoved — FPMM metrics + PnL + record
// ============================================================

indexer.onEvent(
  { contract: "FixedProductMarketMaker", event: "FPMMFundingRemoved" },
  async ({ event, context }) => {
    const fpmmAddress = event.srcAddress;
    const fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
    if (!fpmm) return;

    // Update outcome token amounts
    const oldAmounts = fpmm.outcomeTokenAmounts;
    const amountsRemoved = event.params.amountsRemoved;
    const newAmounts: bigint[] = [];
    let amountsProduct = 1n;
    for (let i = 0; i < oldAmounts.length; i++) {
      const newAmt = oldAmounts[i]! - (amountsRemoved[i] ?? 0n);
      newAmounts.push(newAmt);
      amountsProduct *= newAmt;
    }

    const liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
    const newTotalSupply = fpmm.totalSupply - event.params.sharesBurnt;

    // Zero out prices if all liquidity removed
    const newPrices =
      newTotalSupply === 0n
        ? calculatePrices(newAmounts)
        : fpmm.outcomeTokenPrices;

    context.FixedProductMarketMaker.set({
      ...fpmm,
      outcomeTokenAmounts: newAmounts,
      outcomeTokenPrices: newPrices,
      liquidityParameter,
      scaledLiquidityParameter: scaleBigInt(liquidityParameter),
      totalSupply: newTotalSupply,
      liquidityRemoveQuantity: fpmm.liquidityRemoveQuantity + 1n,
    });

    // Record funding removal
    context.FpmmFundingRemoval.set({
      id: getEventKey(event.block.number, event.logIndex),
      timestamp: event.block.timestamp,
      fpmm_id: fpmmAddress,
      funder: event.params.funder,
      amountsRemoved: amountsRemoved.map((v: bigint) => v),
      collateralRemoved: event.params.collateralRemovedFromFeePool,
      sharesBurnt: event.params.sharesBurnt,
    });

    // PnL: Funding removed = buy tokens at market price + sell LP shares
    const conditionId = fpmm.conditions[0];
    if (!conditionId) return;
    const condition = await context.Condition.get(conditionId);
    if (!condition) return;

    const totalRemoved =
      (amountsRemoved[0] ?? 0n) + (amountsRemoved[1] ?? 0n);
    if (totalRemoved === 0n) return;

    let tokensCost = 0n;
    for (let i = 0; i < 2; i++) {
      const positionId = condition.positionIds[i];
      if (positionId === undefined) continue;
      const tokenPrice = computeFpmmPrice(amountsRemoved, i);
      const tokenAmount = amountsRemoved[i] ?? 0n;
      tokensCost += (tokenPrice * tokenAmount) / COLLATERAL_SCALE;

      await updateUserPositionWithBuy(
        context,
        event.params.funder,
        positionId,
        tokenPrice,
        tokenAmount,
      );
    }

    // Sell LP shares. Proceeds per share = everything received for burning
    // them: the outcome tokens (tokensCost, booked as buys above) plus the
    // collateral paid out from the fee pool — mirror of the FundingAdded
    // convention where lpShareCost = collateral in - sendback token value.
    if (event.params.sharesBurnt > 0n) {
      const lpSalePrice =
        ((event.params.collateralRemovedFromFeePool + tokensCost) *
          COLLATERAL_SCALE) /
        event.params.sharesBurnt;

      const fpmmAsBigInt = BigInt(fpmmAddress);
      await updateUserPositionWithSell(
        context,
        event.params.funder,
        fpmmAsBigInt,
        lpSalePrice,
        event.params.sharesBurnt,
      );
    }
  },
);

// ============================================================
// Transfer — pool share tracking
// ============================================================

indexer.onEvent(
  { contract: "FixedProductMarketMaker", event: "Transfer" },
  async ({ event, context }) => {
  const fpmmAddress = event.srcAddress;
  const from = event.params.from;
  const to = event.params.to;
  const value = event.params.value;

  if (from !== ADDRESS_ZERO) {
    const fromMembership = await loadPoolMembership(context, fpmmAddress, from);
    context.FpmmPoolMembership.set({
      ...fromMembership,
      amount: fromMembership.amount - value,
    });
  }

  if (to !== ADDRESS_ZERO) {
    const toMembership = await loadPoolMembership(context, fpmmAddress, to);
    context.FpmmPoolMembership.set({
      ...toMembership,
      amount: toMembership.amount + value,
    });
  }
  },
);
