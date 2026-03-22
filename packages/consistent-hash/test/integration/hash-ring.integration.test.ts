import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { fnv1a } from "../../src/index.js";

import {
  BASELINE_NODES,
  type CacheNode,
  INTEGRATION_KEYS,
  createHashRingHarness,
} from "./support/hash-ring-harness.js";

describe("consistent-hash integration", () => {
  let harness: ReturnType<typeof createHashRingHarness>;

  beforeEach(() => {
    harness = createHashRingHarness();
    harness.seed();
  });

  afterEach(() => {
    harness.reset();

    expect(harness.ring.size).toBe(0);
    expect(harness.ring.nodes).toEqual([]);
  });

  test("adds cache data and exposes stable lookup metadata", () => {
    const key = "user:123";
    const owner = harness.ring.getNode(key);
    const replicas = harness.ring.getNodes(key);
    const snapshot = harness.ring.snapshot();
    const distribution = harness.ring.getDistribution();
    const mappings = harness.ring.getKeyMapping([key, "user:456", "user:789"]);

    expect(owner).toBeDefined();
    expect(typeof fnv1a(key)).toBe("number");
    expect(replicas).toHaveLength(2);
    expect(new Set(replicas.map((node) => node.id)).size).toBe(2);
    expect(snapshot.virtualNodes).toBe(80);
    expect(snapshot.nodeCount).toBe(3);
    expect(snapshot.ringSize).toBe(320);
    expect(snapshot.nodes.map((entry) => entry.nodeId)).toEqual(
      BASELINE_NODES.map((node) => node.id),
    );
    expect(distribution).toHaveLength(3);
    expect(distribution.every((entry) => entry.keyspacePercentage > 0)).toBe(true);
    expect(distribution.reduce((total, entry) => total + entry.keyspaceShare, 0)).toBeCloseTo(1, 8);
    expect(mappings.every((entry) => entry.nodeId !== undefined)).toBe(true);
  });

  test("adds new cache data by only moving keys onto the new node", () => {
    const before = harness.captureAssignments();
    const newNode: CacheNode = {
      id: "cache-d",
      region: "ap-southeast",
      weight: 1,
    };

    harness.ring.addNode(newNode, newNode.weight);

    const after = harness.captureAssignments();
    const movedKeys = INTEGRATION_KEYS.filter((key) => before.get(key) !== after.get(key));

    expect(harness.ring.size).toBe(4);
    expect(harness.ring.snapshot().ringSize).toBe(400);
    expect(movedKeys.length).toBeGreaterThan(0);
    expect(movedKeys.every((key) => after.get(key) === "cache-d")).toBe(true);
  });

  test("reassigns only the removed node's keys when cache data is removed", () => {
    const before = harness.captureAssignments();
    const removed = harness.removeById("cache-b");
    const after = harness.captureAssignments();
    let keysOwnedByRemovedNode = 0;
    let keysMoved = 0;

    for (const key of INTEGRATION_KEYS) {
      const previousOwner = before.get(key);
      const nextOwner = after.get(key);

      if (previousOwner === "cache-b") {
        keysOwnedByRemovedNode += 1;

        if (previousOwner !== nextOwner) {
          keysMoved += 1;
        }

        expect(nextOwner).toBeDefined();
        expect(nextOwner).not.toBe("cache-b");
      } else {
        expect(nextOwner).toBe(previousOwner);
      }
    }

    expect(removed).toBe(true);
    expect(keysOwnedByRemovedNode).toBeGreaterThan(0);
    expect(keysMoved).toBe(keysOwnedByRemovedNode);
    expect(harness.ring.size).toBe(2);
    expect(harness.ring.nodes.map((node) => node.id)).toEqual(["cache-a", "cache-c"]);
  });
});
