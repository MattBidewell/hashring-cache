import { fnv1a } from "./algorithms/fnv1a.js";
import type { HashFunction, HashRingOptions, HashRingSnapshot, WeightedNode } from "./types.js";

interface RingEntry<T> {
  position: number;
  nodeId: string;
  node: T;
}

const DEFAULT_VIRTUAL_NODES = 150;

export class HashRing<T> {
  readonly #hash: HashFunction;
  readonly #getNodeId: (node: T) => string;
  readonly #virtualNodes: number;
  readonly #nodes = new Map<string, WeightedNode<T>>();

  #ring: RingEntry<T>[] = [];
  #positions: number[] = [];

  constructor(options: HashRingOptions<T>) {
    const virtualNodes = options.virtualNodes ?? DEFAULT_VIRTUAL_NODES;

    if (!Number.isInteger(virtualNodes) || virtualNodes < 1) {
      throw new RangeError("virtualNodes must be a positive integer");
    }

    this.#getNodeId = options.getNodeId;
    this.#hash = options.hash ?? fnv1a;
    this.#virtualNodes = virtualNodes;
  }

  addNode(node: T, weight = 1): void {
    this.#assertWeight(weight);

    const nodeId = this.#getNodeId(node);

    if (nodeId.length === 0) {
      throw new Error("getNodeId must return a non-empty string");
    }

    this.#nodes.set(nodeId, { node, weight });
    this.#rebuildRing();
  }

  removeNode(node: T): boolean {
    const nodeId = this.#getNodeId(node);
    const deleted = this.#nodes.delete(nodeId);

    if (deleted) {
      this.#rebuildRing();
    }

    return deleted;
  }

  getNode(key: string): T | undefined {
    if (this.#ring.length === 0) {
      return undefined;
    }

    const entry = this.#ring[this.#findRingIndex(key)];
    return entry?.node;
  }

  getNodes(key: string, count: number): T[] {
    if (!Number.isInteger(count) || count < 1 || this.#ring.length === 0) {
      return [];
    }

    const target = Math.min(count, this.#nodes.size);
    const seenNodeIds = new Set<string>();
    const nodes: T[] = [];
    const start = this.#findRingIndex(key);

    for (let offset = 0; offset < this.#ring.length && nodes.length < target; offset += 1) {
      const entry = this.#ring[(start + offset) % this.#ring.length];

      if (entry && !seenNodeIds.has(entry.nodeId)) {
        seenNodeIds.add(entry.nodeId);
        nodes.push(entry.node);
      }
    }

    return nodes;
  }

  size(): number {
    return this.#nodes.size;
  }

  nodes(): T[] {
    return Array.from(this.#nodes.values(), ({ node }) => node);
  }

  snapshot(): HashRingSnapshot<T> {
    const nodes = Array.from(this.#nodes.entries(), ([nodeId, weightedNode]) => ({
      nodeId,
      node: weightedNode.node,
      weight: weightedNode.weight,
      virtualNodeCount: Math.max(1, Math.round(this.#virtualNodes * weightedNode.weight)),
    }));

    return {
      virtualNodes: this.#virtualNodes,
      nodeCount: this.#nodes.size,
      ringSize: this.#ring.length,
      nodes,
      entries: this.#ring.map((entry) => ({
        position: entry.position,
        nodeId: entry.nodeId,
        node: entry.node,
      })),
    };
  }

  #assertWeight(weight: number): void {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError("weight must be a positive number");
    }
  }

  #rebuildRing(): void {
    const nextRing: RingEntry<T>[] = [];

    for (const [nodeId, weightedNode] of this.#nodes) {
      const vnodeCount = Math.max(1, Math.round(this.#virtualNodes * weightedNode.weight));

      for (let vnodeIndex = 0; vnodeIndex < vnodeCount; vnodeIndex += 1) {
        nextRing.push({
          position: this.#hash(nodeId + ":" + vnodeIndex),
          nodeId,
          node: weightedNode.node,
        });
      }
    }

    nextRing.sort((left, right) => left.position - right.position);

    this.#ring = nextRing;
    this.#positions = nextRing.map((entry) => entry.position);
  }

  #findRingIndex(key: string): number {
    const position = this.#hash(key);
    let low = 0;
    let high = this.#positions.length;

    while (low < high) {
      const mid = low + ((high - low) >> 1);
      const candidate = this.#positions[mid];

      if (candidate === undefined || candidate < position) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low === this.#positions.length ? 0 : low;
  }
}
