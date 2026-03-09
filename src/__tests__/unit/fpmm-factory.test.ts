import { describe, it, expect } from "vitest";
import {
  MockDb,
  FPMMFactory,
  Addresses,
  MOCK_CONDITION_ID,
  MOCK_USDC,
  MOCK_CONDITIONAL_TOKENS,
} from "../helpers/test-utils.js";

describe("FPMMFactory - FixedProductMarketMakerCreation", () => {
  it("should create FixedProductMarketMaker entity with full fields", async () => {
    const mockDb = MockDb.createMockDb();
    const fpmmAddr = Addresses.mockAddresses[0]!;

    // Seed condition (required for factory validation)
    const seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    const mockEvent =
      FPMMFactory.FixedProductMarketMakerCreation.createMockEvent({
        creator: Addresses.mockAddresses[1]!,
        fixedProductMarketMaker: fpmmAddr,
        conditionalTokens: MOCK_CONDITIONAL_TOKENS,
        collateralToken: MOCK_USDC,
        conditionIds: [MOCK_CONDITION_ID],
        fee: 2000n,
      });

    const result =
      await FPMMFactory.FixedProductMarketMakerCreation.processEvent({
        event: mockEvent,
        mockDb: seededDb,
      });

    const fpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(fpmm).toBeDefined();
    expect(fpmm!.id).toBe(fpmmAddr);
    expect(fpmm!.fee).toBe(2000n);
    expect(fpmm!.tradesQuantity).toBe(0n);
    expect(fpmm!.totalSupply).toBe(0n);
    expect(fpmm!.outcomeTokenAmounts).toEqual([0n, 0n]);
    expect(fpmm!.conditions).toEqual([MOCK_CONDITION_ID]);
  });

  it("should skip FPMM with wrong ConditionalTokens address", async () => {
    const mockDb = MockDb.createMockDb();
    const fpmmAddr = Addresses.mockAddresses[0]!;

    const seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    const mockEvent =
      FPMMFactory.FixedProductMarketMakerCreation.createMockEvent({
        creator: Addresses.mockAddresses[1]!,
        fixedProductMarketMaker: fpmmAddr,
        conditionalTokens: Addresses.mockAddresses[2]!, // wrong address
        collateralToken: MOCK_USDC,
        conditionIds: [MOCK_CONDITION_ID],
        fee: 2000n,
      });

    const result =
      await FPMMFactory.FixedProductMarketMakerCreation.processEvent({
        event: mockEvent,
        mockDb: seededDb,
      });

    const fpmm = result.entities.FixedProductMarketMaker.get(fpmmAddr);
    expect(fpmm).toBeUndefined();
  });
});

describe("FPMMFactory - missing condition", () => {
  it("should skip FPMM when referenced condition does not exist", async () => {
    const mockDb = MockDb.createMockDb();
    const fpmmAddr = Addresses.mockAddresses[0]!;

    const mockEvent = FPMMFactory.FixedProductMarketMakerCreation.createMockEvent({
      creator: Addresses.mockAddresses[1]!,
      fixedProductMarketMaker: fpmmAddr,
      conditionalTokens: MOCK_CONDITIONAL_TOKENS,
      collateralToken: MOCK_USDC,
      conditionIds: ["0x0000000000000000000000000000000000000000000000000000000000009999"],
      fee: 2000n,
    });

    const result = await FPMMFactory.FixedProductMarketMakerCreation.processEvent({
      event: mockEvent,
      mockDb,
    });

    expect(result.entities.FixedProductMarketMaker.get(fpmmAddr)).toBeUndefined();
  });
});
