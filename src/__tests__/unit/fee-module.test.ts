import { describe, it, expect } from "vitest";
import {
  MockDb,
  FeeModule,
  Addresses,
} from "../helpers/test-utils.js";

describe("FeeModule", () => {
  it("should create a FeeRefunded entity from FeeRefunded event", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = FeeModule.FeeRefunded.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      to: Addresses.mockAddresses[0]!,
      id: 12345n,
      refund: 1000n,
      feeCharged: 500n,
    });

    const result = await FeeModule.FeeRefunded.processEvent({
      event: mockEvent,
      mockDb,
    });

    const entities = result.entities.FeeRefunded.getAll();
    expect(entities.length).toBe(1);
    const entity = entities[0]!;
    expect(entity.tokenId).toBe("12345");
    expect(entity.feeRefunded).toBe(1000n);
    expect(entity.feeCharged).toBe(500n);
    expect(entity.refundee).toBe(Addresses.mockAddresses[0]!);
  });
});

describe("FeeModule - negRisk detection", () => {
  it("should set negRisk=true for NegRiskFeeModule address", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = FeeModule.FeeRefunded.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      to: Addresses.mockAddresses[0]!,
      id: 99n,
      refund: 2000n,
      feeCharged: 1000n,
    });
    (mockEvent as any).srcAddress = "0xB768891e3130F6dF18214Ac804d4DB76c2C37730";

    const result = await FeeModule.FeeRefunded.processEvent({ event: mockEvent, mockDb });

    const entities = result.entities.FeeRefunded.getAll();
    expect(entities.length).toBe(1);
    expect(entities[0]!.negRisk).toBe(true);
  });

  it("should set negRisk=false for standard FeeModule address", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = FeeModule.FeeRefunded.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      to: Addresses.mockAddresses[0]!,
      id: 50n,
      refund: 500n,
      feeCharged: 200n,
    });
    (mockEvent as any).srcAddress = "0xE3f18aCc55091e2c48d883fc8C8413319d4Ab7b0";

    const result = await FeeModule.FeeRefunded.processEvent({ event: mockEvent, mockDb });

    const entities = result.entities.FeeRefunded.getAll();
    expect(entities.length).toBe(1);
    expect(entities[0]!.negRisk).toBe(false);
  });
});
