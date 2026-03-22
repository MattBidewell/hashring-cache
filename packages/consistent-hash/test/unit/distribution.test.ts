import { describe, expect, test } from "vitest";

import { HashRing } from "../../src/index.js";

function standardDeviation(values: number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance);
}

describe("distribution", () => {
  test("spreads keys reasonably evenly across nodes", () => {
    const ring = new HashRing<string>({ nodeToKey: (node) => node, virtualNodes: 150 });
    const nodeCount = 8;
    const keyCount = 100_000;

    for (let index = 0; index < nodeCount; index += 1) {
      ring.addNode("node-" + index);
    }

    const counts = new Map<string, number>();

    for (let index = 0; index < keyCount; index += 1) {
      const owner = ring.getNode("key-" + index);

      if (owner) {
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
    }

    const values = Array.from(counts.values());
    const mean = keyCount / nodeCount;
    const deviation = standardDeviation(values);

    expect(values).toHaveLength(nodeCount);
    expect(deviation / mean).toBeLessThan(0.12);
  });
});
