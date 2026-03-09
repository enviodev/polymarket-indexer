import { TestHelpers } from "generated";
import type {
  FeeRefunded,
  Game,
  Market,
  Wallet,
  Orderbook,
  OrdersMatchedGlobal,
  Condition,
  NegRiskEvent,
} from "generated";

// Import handlers to register them before tests run
import "../../handlers/FeeModule.js";
import "../../handlers/UmaSportsOracle.js";
import "../../handlers/Wallet.js";
import "../../handlers/Exchange.js";
import "../../handlers/ConditionalTokens.js";
import "../../handlers/NegRiskAdapter.js";
import "../../handlers/FPMMFactory.js";
import "../../handlers/FixedProductMarketMaker.js";

// ============================================================
// Destructured TestHelpers
// ============================================================

export const {
  MockDb,
  FeeModule,
  UmaSportsOracle,
  RelayHub,
  SafeProxyFactory,
  USDC,
  Exchange,
  ConditionalTokens,
  NegRiskAdapter,
  FPMMFactory,
  FixedProductMarketMaker: FPMMTestHelper,
  Addresses,
} = TestHelpers;

// ============================================================
// Shared Constants
// ============================================================

export const MOCK_CONDITION_ID =
  "0x000000000000000000000000000000000000000000000000000000000000abcd";
export const MOCK_USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
export const MOCK_CONDITIONAL_TOKENS =
  "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
export const MOCK_PARENT_COLLECTION =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// ============================================================
// Seeder Functions
// ============================================================

export function seedCondition(mockDb: any, conditionId: string = MOCK_CONDITION_ID) {
  return mockDb.entities.Condition.set({
    id: conditionId,
    positionIds: [100n, 101n],
    payoutNumerators: [],
    payoutDenominator: 0n,
  });
}

export function seedFPMM(mockDb: any, fpmmAddr: string, conditionId: string = MOCK_CONDITION_ID) {
  let db = seedCondition(mockDb, conditionId);
  db = db.entities.FixedProductMarketMaker.set({
    id: fpmmAddr,
    creator: Addresses.mockAddresses[1]!,
    creationTimestamp: 1700000000n,
    creationTransactionHash: "0xdeadbeef",
    collateralToken: MOCK_USDC,
    conditionalTokenAddress: MOCK_CONDITIONAL_TOKENS.toLowerCase(),
    conditions: [conditionId],
    fee: 2000n,
    totalSupply: 0n,
    outcomeTokenAmounts: [10_000_000n, 10_000_000n],
    outcomeTokenPrices: [0.5, 0.5],
    lastActiveDay: 0n,
    collateralVolume: 0n,
    scaledCollateralVolume: 0,
    collateralBuyVolume: 0n,
    scaledCollateralBuyVolume: 0,
    collateralSellVolume: 0n,
    scaledCollateralSellVolume: 0,
    liquidityParameter: 10_000_000n,
    scaledLiquidityParameter: 10,
    feeVolume: 0n,
    scaledFeeVolume: 0,
    tradesQuantity: 0n,
    buysQuantity: 0n,
    sellsQuantity: 0n,
    liquidityAddQuantity: 0n,
    liquidityRemoveQuantity: 0n,
    outcomeSlotCount: 2n,
  });
  return db;
}

export function seedWallet(mockDb: any, walletAddr: string, balance: bigint = 0n) {
  return mockDb.entities.Wallet.set({
    id: walletAddr,
    signer: walletAddr,
    type: "safe",
    balance,
    lastTransfer: 0n,
    createdAt: 100n,
  });
}

export function seedNegRiskEvent(
  mockDb: any,
  marketId: string,
  feeBps: bigint = 100n,
  questionCount: bigint = 0n,
) {
  return mockDb.entities.NegRiskEvent.set({
    id: marketId,
    feeBps,
    questionCount,
  });
}

export function seedUserPosition(
  mockDb: any,
  user: string,
  tokenId: bigint,
  amount: bigint,
  avgPrice: bigint,
  realizedPnl: bigint = 0n,
  totalBought?: bigint,
) {
  return mockDb.entities.UserPosition.set({
    id: `${user}-${tokenId}`,
    user,
    tokenId,
    amount,
    avgPrice,
    realizedPnl,
    totalBought: totalBought ?? amount,
  });
}

// ============================================================
// Re-exports
// ============================================================

export type {
  FeeRefunded,
  Game,
  Market,
  Wallet,
  Orderbook,
  OrdersMatchedGlobal,
  Condition,
  NegRiskEvent,
};
