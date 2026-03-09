import { describe, it, expect } from "vitest";
import {
  MockDb,
  RelayHub,
  SafeProxyFactory,
  USDC,
  Addresses,
} from "../helpers/test-utils.js";
import { PROXY_WALLET_FACTORY, PROXY_WALLET_IMPLEMENTATION } from "../../utils/constants.js";
import { computeProxyWalletAddress } from "../../utils/wallet.js";

describe("Wallet - SafeProxyFactory", () => {
  it("should create a Wallet entity from ProxyCreation event", async () => {
    const mockDb = MockDb.createMockDb();
    const proxyAddr = Addresses.mockAddresses[0]!;
    const ownerAddr = Addresses.mockAddresses[1]!;

    const mockEvent = SafeProxyFactory.ProxyCreation.createMockEvent({
      proxy: proxyAddr,
      owner: ownerAddr,
    });

    const result = await SafeProxyFactory.ProxyCreation.processEvent({
      event: mockEvent,
      mockDb,
    });

    const wallet = result.entities.Wallet.get(proxyAddr);
    expect(wallet).toBeDefined();
    expect(wallet!.signer).toBe(ownerAddr);
    expect(wallet!.type).toBe("safe");
    expect(wallet!.balance).toBe(0n);
  });
});

describe("Wallet - USDC Transfer", () => {
  it("should update wallet balance on incoming USDC transfer", async () => {
    const mockDb = MockDb.createMockDb();
    const walletAddr = Addresses.mockAddresses[0]!;
    const senderAddr = Addresses.mockAddresses[1]!;

    // Seed a wallet
    const seededDb = mockDb.entities.Wallet.set({
      id: walletAddr,
      signer: walletAddr,
      type: "safe",
      balance: 1000n,
      lastTransfer: 0n,
      createdAt: 100n,
    });

    const mockEvent = USDC.Transfer.createMockEvent({
      from: senderAddr,
      to: walletAddr,
      amount: 500n,
    });

    const result = await USDC.Transfer.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const wallet = result.entities.Wallet.get(walletAddr);
    expect(wallet).toBeDefined();
    expect(wallet!.balance).toBe(1500n);
  });

  it("should update wallet balance on outgoing USDC transfer", async () => {
    const mockDb = MockDb.createMockDb();
    const walletAddr = Addresses.mockAddresses[0]!;
    const receiverAddr = Addresses.mockAddresses[1]!;

    const seededDb = mockDb.entities.Wallet.set({
      id: walletAddr,
      signer: walletAddr,
      type: "safe",
      balance: 1000n,
      lastTransfer: 0n,
      createdAt: 100n,
    });

    const mockEvent = USDC.Transfer.createMockEvent({
      from: walletAddr,
      to: receiverAddr,
      amount: 300n,
    });

    const result = await USDC.Transfer.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const wallet = result.entities.Wallet.get(walletAddr);
    expect(wallet).toBeDefined();
    expect(wallet!.balance).toBe(700n);
  });
});

describe("Wallet - GlobalUSDCBalance", () => {
  it("should create and update GlobalUSDCBalance on incoming transfer", async () => {
    const mockDb = MockDb.createMockDb();
    const walletAddr = Addresses.mockAddresses[0]!;

    const seededDb = mockDb.entities.Wallet.set({
      id: walletAddr,
      signer: walletAddr,
      type: "safe",
      balance: 0n,
      lastTransfer: 0n,
      createdAt: 100n,
    });

    const mockEvent = USDC.Transfer.createMockEvent({
      from: Addresses.mockAddresses[1]!,
      to: walletAddr,
      amount: 5_000_000n,
    });

    const result = await USDC.Transfer.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const global = result.entities.GlobalUSDCBalance.get("global");
    expect(global).toBeDefined();
    expect(global!.balance).toBe(5_000_000n);
  });

  it("should track balance between two known wallets (net zero)", async () => {
    const mockDb = MockDb.createMockDb();
    const walletA = Addresses.mockAddresses[0]!;
    const walletB = Addresses.mockAddresses[1]!;

    let seededDb = mockDb.entities.Wallet.set({
      id: walletA,
      signer: walletA,
      type: "safe",
      balance: 10_000_000n,
      lastTransfer: 0n,
      createdAt: 100n,
    });
    seededDb = seededDb.entities.Wallet.set({
      id: walletB,
      signer: walletB,
      type: "safe",
      balance: 2_000_000n,
      lastTransfer: 0n,
      createdAt: 100n,
    });
    seededDb = seededDb.entities.GlobalUSDCBalance.set({
      id: "global",
      balance: 12_000_000n,
    });

    const mockEvent = USDC.Transfer.createMockEvent({
      from: walletA,
      to: walletB,
      amount: 3_000_000n,
    });

    const result = await USDC.Transfer.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    expect(result.entities.Wallet.get(walletA)!.balance).toBe(7_000_000n);
    expect(result.entities.Wallet.get(walletB)!.balance).toBe(5_000_000n);
    // Internal transfer: global stays the same
    expect(result.entities.GlobalUSDCBalance.get("global")!.balance).toBe(12_000_000n);
  });
});

describe("Wallet - duplicate ProxyCreation", () => {
  it("should not overwrite existing wallet", async () => {
    const mockDb = MockDb.createMockDb();
    const proxyAddr = Addresses.mockAddresses[0]!;

    const seededDb = mockDb.entities.Wallet.set({
      id: proxyAddr,
      signer: Addresses.mockAddresses[1]!,
      type: "safe",
      balance: 5_000_000n,
      lastTransfer: 100n,
      createdAt: 50n,
    });

    const mockEvent = SafeProxyFactory.ProxyCreation.createMockEvent({
      proxy: proxyAddr,
      owner: Addresses.mockAddresses[2]!,
    });

    const result = await SafeProxyFactory.ProxyCreation.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const wallet = result.entities.Wallet.get(proxyAddr);
    expect(wallet!.signer).toBe(Addresses.mockAddresses[1]!);
    expect(wallet!.balance).toBe(5_000_000n);
  });
});

describe("Wallet - RelayHub TransactionRelayed", () => {
  it("should create a Wallet with type proxy when to matches PROXY_WALLET_FACTORY", async () => {
    const mockDb = MockDb.createMockDb();
    const signerAddr = Addresses.mockAddresses[0]!;

    const mockEvent = RelayHub.TransactionRelayed.createMockEvent({
      from: signerAddr,
      to: PROXY_WALLET_FACTORY,
    });

    const result = await RelayHub.TransactionRelayed.processEvent({
      event: mockEvent,
      mockDb,
    });

    // Compute expected wallet address deterministically
    const expectedAddr = computeProxyWalletAddress(
      signerAddr as `0x${string}`,
      PROXY_WALLET_FACTORY as `0x${string}`,
      PROXY_WALLET_IMPLEMENTATION as `0x${string}`,
    );

    const wallet = result.entities.Wallet.get(expectedAddr);
    expect(wallet).toBeDefined();
    expect(wallet!.signer).toBe(signerAddr);
    expect(wallet!.type).toBe("proxy");
    expect(wallet!.balance).toBe(0n);
  });
});

// ============================================================
// Test #15: RelayHub TransactionRelayed to != PROXY_WALLET_FACTORY
// ============================================================

describe("Wallet - RelayHub TransactionRelayed to random address", () => {
  it("should NOT create a Wallet when to is not PROXY_WALLET_FACTORY", async () => {
    const mockDb = MockDb.createMockDb();
    const signerAddr = Addresses.mockAddresses[0]!;
    const randomAddr = Addresses.mockAddresses[2]!;

    const mockEvent = RelayHub.TransactionRelayed.createMockEvent({
      from: signerAddr,
      to: randomAddr,
    });

    const result = await RelayHub.TransactionRelayed.processEvent({
      event: mockEvent,
      mockDb,
    });

    // No wallet should be created since `to` is not PROXY_WALLET_FACTORY
    const wallets = result.entities.Wallet.getAll();
    expect(wallets.length).toBe(0);
  });
});

// ============================================================
// Test #16: USDC Transfer with unknown wallet
// ============================================================

describe("Wallet - USDC Transfer with unknown wallets", () => {
  it("should NOT create or modify entities when neither sender nor receiver is a known Wallet", async () => {
    const mockDb = MockDb.createMockDb();
    const unknownSender = Addresses.mockAddresses[3]!;
    const unknownReceiver = Addresses.mockAddresses[4]!;

    const mockEvent = USDC.Transfer.createMockEvent({
      from: unknownSender,
      to: unknownReceiver,
      amount: 1_000_000n,
    });

    const result = await USDC.Transfer.processEvent({
      event: mockEvent,
      mockDb,
    });

    // No wallets should exist
    const wallets = result.entities.Wallet.getAll();
    expect(wallets.length).toBe(0);

    // No GlobalUSDCBalance should be created
    const global = result.entities.GlobalUSDCBalance.get("global");
    expect(global).toBeUndefined();
  });
});
