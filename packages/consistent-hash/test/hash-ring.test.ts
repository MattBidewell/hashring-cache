import { describe, expect, test } from "vitest";

import { HashRing } from "../src/index.js";

describe("HashRing", () => {
  test("returns undefined when the ring is empty", () => {
    const ring = new HashRing<string>({ getNodeId: (node) => node });

    expect(ring.getNode("alpha")).toBeUndefined();
    expect(ring.getNodes("alpha", 3)).toEqual([]);
  });

  test("adds and removes nodes by stable node id", () => {
    const ring = new HashRing<{ id: string }>({ getNodeId: (node) => node.id });
    const nodeA = { id: "node-a" };
    const nodeB = { id: "node-b" };

    ring.addNode(nodeA);
    ring.addNode(nodeB);

    expect(ring.size()).toBe(2);
    expect(ring.nodes()).toEqual([nodeA, nodeB]);

    expect(ring.removeNode({ id: "node-a" })).toBe(true);
    expect(ring.size()).toBe(1);
    expect(ring.nodes()).toEqual([nodeB]);
  });

  test("returns distinct nodes for replica selection", () => {
    const ring = new HashRing<string>({ getNodeId: (node) => node, virtualNodes: 50 });

    ring.addNode("node-a");
    ring.addNode("node-b");
    ring.addNode("node-c");

    const replicas = ring.getNodes("replicated-key", 3);

    expect(new Set(replicas).size).toBe(3);
    expect(replicas).toHaveLength(3);
  });

  test("honors node weights over many lookups", () => {
    const ring = new HashRing<string>({ getNodeId: (node) => node, virtualNodes: 150 });

    ring.addNode("small", 1);
    ring.addNode("large", 3);

    let small = 0;
    let large = 0;

    for (let index = 0; index < 50_000; index += 1) {
      const owner = ring.getNode("key-" + index);

      if (owner === "small") {
        small += 1;
      } else if (owner === "large") {
        large += 1;
      }
    }

    expect(large).toBeGreaterThan(small * 2.2);
  });

  test("validates virtualNodes and weight values", () => {
    expect(() => new HashRing<string>({ getNodeId: (node) => node, virtualNodes: 0 })).toThrow();

    const ring = new HashRing<string>({ getNodeId: (node) => node });

    expect(() => ring.addNode("node-a", 0)).toThrow();
    expect(() => ring.addNode("node-a", Number.NaN)).toThrow();
  });

  test("exposes a snapshot for debugging and visualization", () => {
    const ring = new HashRing<string>({ getNodeId: (node) => node, virtualNodes: 10 });

    ring.addNode("node-a");
    ring.addNode("node-b", 2);

    const snapshot = ring.snapshot();

    expect(snapshot.virtualNodes).toBe(10);
    expect(snapshot.nodeCount).toBe(2);
    expect(snapshot.ringSize).toBe(30);
    expect(snapshot.nodes).toEqual([
      { nodeId: "node-a", node: "node-a", weight: 1, virtualNodeCount: 10 },
      { nodeId: "node-b", node: "node-b", weight: 2, virtualNodeCount: 20 },
    ]);
    expect(snapshot.entries).toHaveLength(30);
    expect(snapshot.entries[0]?.position).toBeLessThanOrEqual(snapshot.entries[29]?.position ?? 0);
  });
});
