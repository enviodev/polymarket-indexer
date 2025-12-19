## Polymarket Indexer

_Please check the [documentation website](https://docs.envio.dev) for a complete guide on all [Envio](https://envio.dev) indexer features._

This indexer is still a work in progress. Do not use it in production. It is meant only as a reference.

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
- [ ] Sports Oracle Subgraph (work in progress)
- [ ] PNL Subgraph
- [ ] Order Book Subgraph
- [ ] OI Subgraph
- [ ] FPMM Subgraph

## Tasks

- [ ] Migrate all subgraphs
- [ ] Validate data against the Polymarket indexer
