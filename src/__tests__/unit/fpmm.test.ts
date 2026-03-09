import { describe, it, expect } from "vitest";
import {
  MockDb,
  FPMMTestHelper,
  Addresses,
  MOCK_CONDITION_ID,
  MOCK_USDC,
  MOCK_CONDITIONAL_TOKENS,
  seedFPMM,
} from "../helpers/test-utils.js";

describe("FixedProductMarketMaker - FPMMBuy", () => {
  it("should update FPMM metrics and create transaction on buy", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = FPMMTestHelper.FPMMBuy.createMockEvent({
      buyer: Addresses.mockAddresses[2]!,
      investmentAmount: 1_000_000n,
      feeAmount: 20_000n,
      outcomeIndex: 0n,
      outcomeTokensBought: 1_900_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMBuy.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const fpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(fpmm!.tradesQuantity).toBe(1n);
    expect(fpmm!.buysQuantity).toBe(1n);
    expect(fpmm!.collateralVolume).toBe(1_000_000n);
    expect(fpmm!.collateralBuyVolume).toBe(1_000_000n);
    expect(fpmm!.feeVolume).toBe(20_000n);

    const txns = result.entities.FpmmTransaction.getAll();
    expect(txns.length).toBe(1);
    expect(txns[0]!.type).toBe("Buy");
    expect(txns[0]!.tradeAmount).toBe(1_000_000n);
    expect(txns[0]!.outcomeTokensAmount).toBe(1_900_000n);
  });
});

describe("FixedProductMarketMaker - FPMMSell", () => {
  it("should update FPMM metrics and create transaction on sell", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = FPMMTestHelper.FPMMSell.createMockEvent({
      seller: Addresses.mockAddresses[2]!,
      returnAmount: 800_000n,
      feeAmount: 16_000n,
      outcomeIndex: 1n,
      outcomeTokensSold: 1_500_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMSell.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const fpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(fpmm!.tradesQuantity).toBe(1n);
    expect(fpmm!.sellsQuantity).toBe(1n);
    expect(fpmm!.collateralVolume).toBe(800_000n);
    expect(fpmm!.collateralSellVolume).toBe(800_000n);
    expect(fpmm!.feeVolume).toBe(16_000n);

    const txns = result.entities.FpmmTransaction.getAll();
    expect(txns[0]!.type).toBe("Sell");
  });
});

describe("FixedProductMarketMaker - FPMMFundingAdded", () => {
  it("should update totalSupply and record funding addition", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = FPMMTestHelper.FPMMFundingAdded.createMockEvent({
      funder: Addresses.mockAddresses[2]!,
      amountsAdded: [5_000_000n, 5_000_000n],
      sharesMinted: 5_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingAdded.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const fpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(fpmm!.totalSupply).toBe(5_000_000n);
    expect(fpmm!.liquidityAddQuantity).toBe(1n);
    expect(fpmm!.outcomeTokenAmounts).toEqual([15_000_000n, 15_000_000n]);

    const additions = result.entities.FpmmFundingAddition.getAll();
    expect(additions.length).toBe(1);
    expect(additions[0]!.sharesMinted).toBe(5_000_000n);
    expect(additions[0]!.amountsRefunded).toEqual([0n, 0n]);
  });

  it("should compute amountsRefunded for unbalanced funding", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = FPMMTestHelper.FPMMFundingAdded.createMockEvent({
      funder: Addresses.mockAddresses[2]!,
      amountsAdded: [8_000_000n, 5_000_000n],
      sharesMinted: 5_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingAdded.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const additions = result.entities.FpmmFundingAddition.getAll();
    expect(additions[0]!.amountsRefunded).toEqual([0n, 3_000_000n]);
  });
});

describe("FixedProductMarketMaker - FPMMFundingRemoved", () => {
  it("should decrease totalSupply and record funding removal", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    let seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);
    const fpmm = seededDb.entities.FixedProductMarketMaker.get(fpmmAddr)!;
    seededDb = seededDb.entities.FixedProductMarketMaker.set({ ...fpmm, totalSupply: 10_000_000n });

    const mockEvent = FPMMTestHelper.FPMMFundingRemoved.createMockEvent({
      funder: Addresses.mockAddresses[2]!,
      amountsRemoved: [3_000_000n, 3_000_000n],
      collateralRemovedFromFeePool: 3_000_000n,
      sharesBurnt: 3_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingRemoved.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const updatedFpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(updatedFpmm!.totalSupply).toBe(7_000_000n);
    expect(updatedFpmm!.liquidityRemoveQuantity).toBe(1n);
    expect(updatedFpmm!.outcomeTokenAmounts).toEqual([7_000_000n, 7_000_000n]);

    const removals = result.entities.FpmmFundingRemoval.getAll();
    expect(removals.length).toBe(1);
    expect(removals[0]!.sharesBurnt).toBe(3_000_000n);
  });
});

describe("FixedProductMarketMaker - Transfer pool membership", () => {
  it("should update pool membership on transfer", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const from = Addresses.mockAddresses[1]!;
    const to = Addresses.mockAddresses[2]!;
    const mockDb = MockDb.createMockDb();

    const seededDb = mockDb.entities.FpmmPoolMembership.set({
      id: `${fpmmAddr}-${from}`,
      pool_id: fpmmAddr,
      funder: from,
      amount: 5_000_000n,
    });

    const mockEvent = FPMMTestHelper.Transfer.createMockEvent({ from, to, value: 2_000_000n });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.Transfer.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    expect(result.entities.FpmmPoolMembership.get(`${fpmmAddr}-${from}`)!.amount).toBe(3_000_000n);
    expect(result.entities.FpmmPoolMembership.get(`${fpmmAddr}-${to}`)!.amount).toBe(2_000_000n);
  });

  it("should handle mint (from zero address)", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const to = Addresses.mockAddresses[1]!;
    const mockDb = MockDb.createMockDb();

    const mockEvent = FPMMTestHelper.Transfer.createMockEvent({
      from: "0x0000000000000000000000000000000000000000",
      to,
      value: 1_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.Transfer.processEvent({
      event: mockEvent,
      mockDb,
    });

    expect(result.entities.FpmmPoolMembership.get(`${fpmmAddr}-${to}`)!.amount).toBe(1_000_000n);
    const zeroMembership = result.entities.FpmmPoolMembership.get(
      `${fpmmAddr}-0x0000000000000000000000000000000000000000`,
    );
    expect(zeroMembership).toBeUndefined();
  });
});

// ============================================================
// Test #1: FPMMBuy PnL tracking
// ============================================================

describe("FixedProductMarketMaker - FPMMBuy PnL tracking", () => {
  it("should create a UserPosition for the buyer after a buy", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const buyer = Addresses.mockAddresses[2]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = FPMMTestHelper.FPMMBuy.createMockEvent({
      buyer,
      investmentAmount: 1_000_000n,
      feeAmount: 20_000n,
      outcomeIndex: 0n,
      outcomeTokensBought: 1_900_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMBuy.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // price = investmentAmount * COLLATERAL_SCALE / outcomeTokensBought
    // price = 1_000_000 * 1_000_000 / 1_900_000 = 526315
    const pos = result.entities.UserPosition.get(`${buyer}-100`);
    expect(pos).toBeDefined();
    expect(pos!.amount).toBe(1_900_000n);
    expect(pos!.avgPrice).toBe(526315n);
    expect(pos!.user).toBe(buyer);
  });
});

// ============================================================
// Test #1b: FPMMSell PnL tracking
// ============================================================

describe("FixedProductMarketMaker - FPMMSell PnL tracking", () => {
  it("should update UserPosition for the seller after a sell", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const seller = Addresses.mockAddresses[2]!;
    const mockDb = MockDb.createMockDb();
    let seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);
    // Seed an existing position for the seller
    seededDb = seededDb.entities.UserPosition.set({
      id: `${seller}-101`,
      user: seller,
      tokenId: 101n,
      amount: 2_000_000n,
      avgPrice: 400_000n,
      realizedPnl: 0n,
      totalBought: 2_000_000n,
    });

    const mockEvent = FPMMTestHelper.FPMMSell.createMockEvent({
      seller,
      returnAmount: 800_000n,
      feeAmount: 16_000n,
      outcomeIndex: 1n,
      outcomeTokensSold: 1_500_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMSell.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // price = returnAmount * COLLATERAL_SCALE / outcomeTokensSold
    // price = 800_000 * 1_000_000 / 1_500_000 = 533333
    // pnl = 1_500_000 * (533333 - 400_000) / 1_000_000 = 199_999
    const pos = result.entities.UserPosition.get(`${seller}-101`);
    expect(pos).toBeDefined();
    expect(pos!.amount).toBe(500_000n);
    expect(pos!.realizedPnl).toBe(199_999n);
  });
});

// ============================================================
// Test #2: FPMMFundingAdded PnL (LP shares)
// ============================================================

describe("FixedProductMarketMaker - FPMMFundingAdded PnL", () => {
  it("should create UserPosition for LP shares on funding added", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const funder = Addresses.mockAddresses[2]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = FPMMTestHelper.FPMMFundingAdded.createMockEvent({
      funder,
      amountsAdded: [5_000_000n, 5_000_000n],
      sharesMinted: 5_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingAdded.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // Balanced addition: sendbackAmount = 0, so tokenCost = 0
    // LP share price = (maxAdded - tokenCost) * COLLATERAL_SCALE / sharesMinted
    // = 5_000_000 * 1_000_000 / 5_000_000 = 1_000_000
    const fpmmAsBigInt = BigInt(fpmmAddr);
    const lpPos = result.entities.UserPosition.get(`${funder}-${fpmmAsBigInt}`);
    expect(lpPos).toBeDefined();
    expect(lpPos!.amount).toBe(5_000_000n);
    expect(lpPos!.avgPrice).toBe(1_000_000n);
  });

  it("should create UserPosition for sendback tokens on unbalanced funding", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const funder = Addresses.mockAddresses[2]!;
    const mockDb = MockDb.createMockDb();
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    // Unbalanced: more tokens added to outcome 0 than outcome 1
    // amountsAdded[0]=8M, amountsAdded[1]=5M
    // outcomeIndex = 1 (the cheaper one, since amountsAdded[0] > amountsAdded[1])
    // sendbackAmount = amountsAdded[1-1] - amountsAdded[1] = 8M - 5M = 3M
    const mockEvent = FPMMTestHelper.FPMMFundingAdded.createMockEvent({
      funder,
      amountsAdded: [8_000_000n, 5_000_000n],
      sharesMinted: 5_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingAdded.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // The sendback token is outcome index 1 (cheaper)
    // sendbackPrice = computeFpmmPrice([8M, 5M], 1) = 8M * 1M / 13M = 615384
    // positionId for outcome 1 = 101n (from seeded condition)
    const pos1 = result.entities.UserPosition.get(`${funder}-101`);
    expect(pos1).toBeDefined();
    expect(pos1!.amount).toBe(3_000_000n);
  });
});

// ============================================================
// Test #2b: FPMMFundingRemoved PnL
// ============================================================

describe("FixedProductMarketMaker - FPMMFundingRemoved PnL", () => {
  it("should create UserPositions for tokens and update LP shares on funding removed", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const funder = Addresses.mockAddresses[2]!;
    const mockDb = MockDb.createMockDb();
    let seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);
    // Set totalSupply > 0 to simulate existing liquidity
    const fpmm = seededDb.entities.FixedProductMarketMaker.get(fpmmAddr)!;
    seededDb = seededDb.entities.FixedProductMarketMaker.set({ ...fpmm, totalSupply: 10_000_000n });

    // Seed LP position for funder
    const fpmmAsBigInt = BigInt(fpmmAddr);
    seededDb = seededDb.entities.UserPosition.set({
      id: `${funder}-${fpmmAsBigInt}`,
      user: funder,
      tokenId: fpmmAsBigInt,
      amount: 10_000_000n,
      avgPrice: 1_000_000n,
      realizedPnl: 0n,
      totalBought: 10_000_000n,
    });

    const mockEvent = FPMMTestHelper.FPMMFundingRemoved.createMockEvent({
      funder,
      amountsRemoved: [3_000_000n, 3_000_000n],
      collateralRemovedFromFeePool: 3_000_000n,
      sharesBurnt: 3_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingRemoved.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // Tokens bought: for each outcome, tokenPrice = computeFpmmPrice([3M, 3M], i) = 500_000
    // tokenAmount = 3M each, tokensCost = 2 * (500_000 * 3M / 1M) = 3_000_000
    // LP sell price = (collateralRemoved - tokensCost) * COLLATERAL_SCALE / sharesBurnt
    //              = (3_000_000 - 3_000_000) * 1M / 3M = 0
    const pos0 = result.entities.UserPosition.get(`${funder}-100`);
    expect(pos0).toBeDefined();
    expect(pos0!.amount).toBe(3_000_000n);

    const pos1 = result.entities.UserPosition.get(`${funder}-101`);
    expect(pos1).toBeDefined();
    expect(pos1!.amount).toBe(3_000_000n);

    // LP position should have decreased
    const lpPos = result.entities.UserPosition.get(`${funder}-${fpmmAsBigInt}`);
    expect(lpPos).toBeDefined();
    expect(lpPos!.amount).toBe(7_000_000n);
  });
});

// ============================================================
// Test #3: FPMMFundingAdded with existing totalSupply > 0
// ============================================================

describe("FixedProductMarketMaker - FPMMFundingAdded prices not recalculated when totalSupply > 0", () => {
  it("should keep existing prices when adding liquidity to an FPMM with supply", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    let seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);
    // Set totalSupply > 0 and unequal prices
    const fpmm = seededDb.entities.FixedProductMarketMaker.get(fpmmAddr)!;
    seededDb = seededDb.entities.FixedProductMarketMaker.set({
      ...fpmm,
      totalSupply: 5_000_000n,
      outcomeTokenAmounts: [8_000_000n, 12_000_000n],
      outcomeTokenPrices: [0.6, 0.4],
    });

    const mockEvent = FPMMTestHelper.FPMMFundingAdded.createMockEvent({
      funder: Addresses.mockAddresses[2]!,
      amountsAdded: [2_000_000n, 2_000_000n],
      sharesMinted: 2_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingAdded.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const updatedFpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    // Prices should NOT be recalculated - they should remain [0.6, 0.4]
    expect(updatedFpmm!.outcomeTokenPrices).toEqual([0.6, 0.4]);
    expect(updatedFpmm!.totalSupply).toBe(7_000_000n);
  });
});

// ============================================================
// Test #4: FPMMFundingRemoved draining all liquidity
// ============================================================

describe("FixedProductMarketMaker - FPMMFundingRemoved draining all liquidity", () => {
  it("should recalculate prices when newTotalSupply === 0", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    let seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);
    const fpmm = seededDb.entities.FixedProductMarketMaker.get(fpmmAddr)!;
    // Set stored prices to [0.7, 0.3] but amounts that would calculate to different prices
    seededDb = seededDb.entities.FixedProductMarketMaker.set({
      ...fpmm,
      totalSupply: 5_000_000n,
      outcomeTokenAmounts: [8_000_000n, 12_000_000n],
      outcomeTokenPrices: [0.7, 0.3],
    });

    // Remove all amounts, draining to zero supply
    const mockEvent = FPMMTestHelper.FPMMFundingRemoved.createMockEvent({
      funder: Addresses.mockAddresses[2]!,
      amountsRemoved: [8_000_000n, 12_000_000n],
      collateralRemovedFromFeePool: 5_000_000n,
      sharesBurnt: 5_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMFundingRemoved.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const updatedFpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(updatedFpmm!.totalSupply).toBe(0n);
    // Prices should be recalculated (not kept as [0.7, 0.3])
    // newAmounts are [0, 0], so calculatePrices([0,0]) will produce different values
    expect(updatedFpmm!.outcomeTokenPrices).not.toEqual([0.7, 0.3]);
  });
});

// ============================================================
// Test #5: FPMMBuy/FPMMSell with no FPMM found
// ============================================================

describe("FixedProductMarketMaker - Buy/Sell with no FPMM found", () => {
  it("should be a no-op when FPMMBuy is called without a seeded FPMM", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();

    const mockEvent = FPMMTestHelper.FPMMBuy.createMockEvent({
      buyer: Addresses.mockAddresses[2]!,
      investmentAmount: 1_000_000n,
      feeAmount: 20_000n,
      outcomeIndex: 0n,
      outcomeTokensBought: 1_900_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMBuy.processEvent({
      event: mockEvent,
      mockDb,
    });

    expect(result.entities.FpmmTransaction.getAll().length).toBe(0);
    expect(result.entities.FixedProductMarketMaker.get(fpmmAddr)).toBeUndefined();
  });

  it("should be a no-op when FPMMSell is called without a seeded FPMM", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();

    const mockEvent = FPMMTestHelper.FPMMSell.createMockEvent({
      seller: Addresses.mockAddresses[2]!,
      returnAmount: 800_000n,
      feeAmount: 16_000n,
      outcomeIndex: 1n,
      outcomeTokensSold: 1_500_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.FPMMSell.processEvent({
      event: mockEvent,
      mockDb,
    });

    expect(result.entities.FpmmTransaction.getAll().length).toBe(0);
    expect(result.entities.FixedProductMarketMaker.get(fpmmAddr)).toBeUndefined();
  });
});

// ============================================================
// Test #6: Transfer burn (to zero address)
// ============================================================

describe("FixedProductMarketMaker - Transfer burn (to zero address)", () => {
  it("should NOT create a pool membership for the zero address on burn", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const from = Addresses.mockAddresses[1]!;
    const mockDb = MockDb.createMockDb();

    const seededDb = mockDb.entities.FpmmPoolMembership.set({
      id: `${fpmmAddr}-${from}`,
      pool_id: fpmmAddr,
      funder: from,
      amount: 5_000_000n,
    });

    const mockEvent = FPMMTestHelper.Transfer.createMockEvent({
      from,
      to: "0x0000000000000000000000000000000000000000",
      value: 2_000_000n,
    });
    (mockEvent as any).srcAddress = fpmmAddr;

    const result = await FPMMTestHelper.Transfer.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // from membership should decrease
    expect(result.entities.FpmmPoolMembership.get(`${fpmmAddr}-${from}`)!.amount).toBe(3_000_000n);
    // zero address should NOT have a pool membership
    const zeroMembership = result.entities.FpmmPoolMembership.get(
      `${fpmmAddr}-0x0000000000000000000000000000000000000000`,
    );
    expect(zeroMembership).toBeUndefined();
  });
});
