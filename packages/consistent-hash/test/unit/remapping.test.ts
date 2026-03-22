import { describe, expect, test } from "vitest";

import { HashRing } from "../../src/index.js";

function captureAssignments(ring: HashRing<string>, totalKeys: number): string[] {
  const owners: string[] = [];

  for (let index = 0; index < totalKeys; index += 1) {
    owners.push(ring.getNode("key-" + index) ?? "");
  }

  return owners;
}

function remapRatio(before: string[], after: string[]): number {
  let moved = 0;

  for (let index = 0; index < before.length; index += 1) {
    if (before[index] !== after[index]) {
      moved += 1;
    }
  }

  return moved / before.length;
}

describe("remapping", () => {
  test("moves a bounded fraction of keys when adding a node", () => {
    const ring = new HashRing<string>({ nodeToKey: (node) => node, virtualNodes: 150 });

    for (let index = 0; index < 5; index += 1) {
      ring.addNode("node-" + index);
    }

    const before = captureAssignments(ring, 100_000);

    ring.addNode("node-5");

    const after = captureAssignments(ring, 100_000);
    const moved = remapRatio(before, after);

    expect(moved).toBeLessThan(0.28);
    expect(moved).toBeGreaterThan(0.08);
  });

  test("mostly remaps keys owned by a removed node", () => {
    const ring = new HashRing<string>({ nodeToKey: (node) => node, virtualNodes: 150 });

    for (let index = 0; index < 6; index += 1) {
      ring.addNode("node-" + index);
    }

    const before = captureAssignments(ring, 100_000);

    ring.removeNode("node-5");

    const after = captureAssignments(ring, 100_000);
    const moved = remapRatio(before, after);

    expect(moved).toBeLessThan(0.25);
    expect(moved).toBeGreaterThan(0.08);
  });
});
