# consistent-hash

Zero-dependency consistent hashing for TypeScript, Node.js, and edge runtimes.

## Features

- Virtual nodes for better distribution
- Weighted nodes
- Pluggable hash function
- Clockwise lookups with binary search
- Replica selection with distinct physical nodes

## Usage

```ts
import { HashRing } from 'consistent-hash';

const ring = new HashRing<string>({
  getNodeId: (node) => node,
  virtualNodes: 150,
});

ring.addNode('cache-a');
ring.addNode('cache-b');
ring.addNode('cache-c', 2);

const owner = ring.getNode('user:123');
const replicas = ring.getNodes('user:123', 2);
```

See `example/basic.ts` in the repo for a more complete example with object nodes and node removal. To run the executable version from the repo root, use `pnpm example:basic`.

There is also an interactive visualizer in `example/index.html`; run it from the repo root with `pnpm viz`.

## API

```ts
new HashRing<T>({
  getNodeId: (node: T) => string,
  virtualNodes?: number,
  hash?: (input: string) => number,
})
```

- `addNode(node, weight?)`
- `removeNode(node)`
- `getNode(key)`
- `getNodes(key, count)`
- `size()`
- `nodes()`
