# hashring-cache

A monorepo for a consistent hashing library and a distributed cache built on Cloudflare Workers + Durable Objects.

## Workspace

- `packages/consistent-hash` - library package

## Getting Started

```bash
pnpm install
pnpm test
pnpm build
```

See `example/basic.ts` for a small end-to-end usage example.

Run it with:

```bash
pnpm example:basic
```

For the interactive ring visualizer:

```bash
pnpm example:viz
```

Then open `http://127.0.0.1:4173/example/`.

To generate a GitHub Pages-friendly static site in `docs/`:

```bash
pnpm build:pages
```

Then publish the `docs/` folder with GitHub Pages and open `/example/` on the published site.

## Description

The first package is a zero-dependency TypeScript hash ring with virtual nodes, weighted nodes, pluggable hashing, and tests for lookup, distribution, and remapping behavior.
