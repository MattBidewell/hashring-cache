import { bench, describe } from "vitest";

import { HashRing } from "../src/index.js";

function createRing(nodeCount: number): HashRing<string> {
  const ring = new HashRing<string>({ nodeToKey: (node) => node, virtualNodes: 150 });

  for (let index = 0; index < nodeCount; index += 1) {
    ring.addNode("node-" + index);
  }

  return ring;
}

describe("lookup", () => {
  const rings = [10, 100, 1000].map((nodeCount) => ({
    nodeCount,
    ring: createRing(nodeCount),
  }));

  for (const { nodeCount, ring } of rings) {
    let keyIndex = 0;

    bench("getNode with " + nodeCount + " nodes", () => {
      ring.getNode("bench-key-" + keyIndex);
      keyIndex += 1;
    });
  }
});
