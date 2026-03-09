# Polymarket Indexer

A unified [Envio HyperIndex](https://envio.dev) indexer that consolidates **8 independent Polymarket subgraphs** into a single, high-performance indexer on Polygon.

## Background

Polymarket originally used 8 separate subgraphs (The Graph, AssemblyScript) to index its on-chain data. Each subgraph tracked a specific domain but shared many of the same contracts, leading to redundant indexing and fragmented data. This project merges all 8 into one TypeScript indexer powered by Envio's HyperSync.

### Source Subgraphs Consolidated

| # | Subgraph | What it tracks |
|---|----------|---------------|
| 1 | **fee-module** | Fee refunds from FeeModule + NegRiskFeeModule |
| 2 | **sports-oracle** | UMA sports oracle games, markets, scores |
| 3 | **wallet** | Wallet creation (Gnosis Safe proxies) + USDC balances |
| 4 | **orderbook** | Exchange order fills, matches, per-token + global volume |
| 5 | **open-interest** | Global + per-market open interest via splits/merges/redemptions |
| 6 | **activity** | Splits, merges, redemptions, neg-risk conversions |
| 7 | **pnl** | User positions, weighted average cost basis, realized PnL |
| 8 | **fpmm** | Fixed Product Market Maker analytics (AMM pools, liquidity, pricing) |

## Architecture

Handlers for the same contract are **merged** — a single `ConditionalTokens.PositionSplit.handler` simultaneously updates open interest, records the split activity, and adjusts user PnL positions. This eliminates redundant event processing.

```
src/
  handlers/
    ConditionalTokens.ts       # OI + activity + PnL (merged from 4 subgraphs)
    Exchange.ts                # Orderbook + PnL
    NegRiskAdapter.ts          # OI + activity + PnL
    FixedProductMarketMaker.ts # FPMM analytics + PnL + LP tracking
    FPMMFactory.ts             # Dynamic contract registration
    FeeModule.ts               # Fee refund tracking
    UmaSportsOracle.ts         # Sports oracle
    Wallet.ts                  # Wallet creation + USDC balances
  utils/
    constants.ts               # Contract addresses, scales
    ctf.ts                     # Position/collection ID computation (keccak256)
    fpmm.ts                    # AMM math (nth root, price calculation)
    negRisk.ts                 # Neg-risk question/condition ID derivation
    pnl.ts                     # PnL tracking (avg price, realized gains)
    wallet.ts                  # Wallet type detection
```

## Contracts Indexed

| Contract | Address | Events |
|----------|---------|--------|
| Exchange + NegRiskExchange | `0x4bFb41d5B...`, `0xC5d563A36...` | OrderFilled, OrdersMatched, TokenRegistered |
| ConditionalTokens | `0x4D97DCd97...` | ConditionPreparation, ConditionResolution, PositionSplit, PositionsMerge, PayoutRedemption |
| NegRiskAdapter | `0xd91E80cF2...` | MarketPrepared, QuestionPrepared, PositionSplit, PositionsMerge, PayoutRedemption, PositionsConverted |
| FPMMFactory | `0x8B9805A2f...` | FixedProductMarketMakerCreation (+ dynamic contract registration) |
| FixedProductMarketMaker | *(dynamic)* | FPMMBuy, FPMMSell, FPMMFundingAdded, FPMMFundingRemoved, Transfer |
| FeeModule + NegRiskFeeModule | `0xE3f18aCc5...`, `0xB768891e3...` | FeeRefunded |
| UmaSportsOracle | `0xb21182d04...` | GameCreated, GameSettled, MarketCreated, MarketResolved, + more |
| USDC / RelayHub / SafeProxyFactory | Various | Transfer, TransactionRelayed, ProxyCreation |

## Getting Started

### Prerequisites

- [Node.js v22+](https://nodejs.org/en/download/current)
- [pnpm](https://pnpm.io/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/)
- [Envio CLI](https://docs.envio.dev) (`npm i -g envio`)

### Setup

```bash
pnpm install
pnpm codegen
```

### Run Locally

```bash
pnpm dev
```

Starts the indexer with a local PostgreSQL database and exposes a GraphQL API at `http://localhost:8080` (password: `testing`).

### Run Tests

```bash
pnpm test
```

29 tests covering all handler phases plus a HyperSync integration test.

## Entities

The schema defines 25+ entity types across all domains:

- **Orderbook**: `OrderFilledEvent`, `OrdersMatchedEvent`, `Orderbook`, `OrdersMatchedGlobal`, `MarketData`
- **Open Interest**: `Condition`, `MarketOpenInterest`, `GlobalOpenInterest`, `NegRiskEvent`
- **Activity**: `Split`, `Merge`, `Redemption`, `NegRiskConversion`, `Position`
- **PnL**: `UserPosition` (tracks amount, avgPrice, realizedPnl, totalBought per user per token)
- **FPMM**: `FixedProductMarketMaker`, `FpmmTransaction`, `FpmmFundingAddition`, `FpmmFundingRemoval`, `FpmmPoolMembership`, `Collateral`
- **Wallet**: `Wallet`, `GlobalUSDCBalance`
- **Fee Module**: `FeeRefunded`
- **Sports Oracle**: `Game`, `Market`

## Tech Stack

- **[Envio HyperIndex](https://docs.envio.dev)** v3 — blockchain indexing framework with HyperSync for fast historical sync
- **TypeScript** — type-safe handlers with generated types from schema + ABIs
- **Vitest** — testing with `createTestIndexer()` for real HyperSync integration tests
- **Polygon** — chain ID 137, starting from block 3,764,531
