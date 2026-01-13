## Polymarket Indexer

_Please check the [documentation website](https://docs.envio.dev) for a complete guide on all [Envio](https://envio.dev) indexer features._

**This indexer is still a work in progress. Do not use it in production. It is meant only as a reference.**

This indexer is built to index events emitted from contracts related to Polymarket. It is created by taking reference from the [Polymarket Subgraph repo](https://github.com/Polymarket/polymarket-subgraph).

### Run

```bash
pnpm dev
```

Open [http://localhost:8080](http://localhost:8080) to access the GraphQL Playground. The local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Pre-requisites

- [Node.js (v18 or newer)](https://nodejs.org/en/download/current)
- [pnpm (v8 or newer)](https://pnpm.io/installation)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Subgraphs Migration Status

- [x] Wallet Subgraph
- [x] Sports Oracle Subgraph
- [x] Order Book Subgraph
- [x] OI Subgraph
- [x] FPMM Subgraph
- [x] Activity Subgraph
- [x] Fee Module Subgraph
- [ ] PNL Subgraph (work in progress)

## Tasks

- [ ] Migrate all subgraphs (work in progress)
- [ ] Validate data against the Polymarket indexer

### Smaller Tasks

- [ ] Effects for fetching details about Collateral Token
- [ ] Remove hardcoded return value from `getCollateralScale` in FPMM handler
- [ ] Debug `TradeType` import in `updatedFields.ts`
- [x] `getPositionId` implementation (file: `ConditionalTokens.ts`)
- [ ] understand the use of GlobalUSDCBalance entity used in polymarket subgraph (`USDC.ts`)
- [ ] Write tests for utility functions like `getPositionId` or `computeProxyWalletAddress`
- [ ] Make sure all error message are descriptive
- [ ] In PNL subgraph, `ConditionalTokens.ConditionPreparation` handler look if you can make a relation between `Condition` & `Position` entity. Note: this might be tricky because `Condition.positionIds` is `bigint[]` & ids in `Position` entity is in `string`.

## Notes

This indexer is a work in progress, and some parts of the logic are still being migrated. Data validation has been done for a few subgraphs so far, and we’ll be expanding correctness checks after the main migration is finished.

- The `polymarket-subgraph` repo tracks `ConditionalTokens` event multiple times which different event handlers but in our case we have merged all those event handlers into one.

- `activity-subgraph/src/FixedProductMarketMakerFactoryMapping.ts` file is not necessary it is copy that is used in the actiivty subgraph so other event handlers can access the FPMM addresses. We are combining all into a single indexer, we already have that handler.
