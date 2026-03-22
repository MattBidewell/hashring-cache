# hashring-cache

A monorepo for a publishable consistent hashing library and a public Cloudflare Workers + Durable Objects reference implementation.

## Workspace

- `packages/consistent-hash` - zero-dependency library package published to npm
- `packages/consistent-hash-cf-do-example` - cloneable Cloudflare Workers + Durable Objects reference implementation

## Getting Started

```bash
pnpm install
pnpm test
pnpm build
```

The repo uses pnpm workspaces and Turborepo to orchestrate package tasks.

## Current Packages

### `consistent-hash`

Portable TypeScript hash ring with virtual nodes, weighted nodes, pluggable hashing, and tests for lookup, distribution, and remapping behavior.

See `example/basic.ts` for a small end-to-end usage example.

```bash
pnpm example:basic
```

For the interactive ring visualizer:

```bash
pnpm example:viz
```

Then open `http://127.0.0.1:4173/example/`.

The visualizer is fully static and self-contained in `example/`, so it can be hosted directly on GitHub Pages without building package output first.

To generate a GitHub Pages-friendly static site in `docs/`:

```bash
pnpm build:pages
```

### `consistent-hash-cf-do-example`

Reference implementation package for the Worker routing layer, Durable Object storage partitions, Wrangler config, and Cloudflare integration tests.

This package is intended as a public example people clone and adapt rather than a package published to npm.
