import { fnv1a } from "./algorithms/fnv1a.js";
import type {
  HashFunction,
  HashRingDistribution,
  HashRingKeyMapping,
  HashRingOptions,
  HashRingSnapshot,
  WeightedNode,
} from "./types.js";

interface RingEntry<T> {
  position: number;
  nodeId: string;
  node: T;
}

const DEFAULT_VIRTUAL_NODES = 150;
const HASH_SPACE_SIZE = 2 ** 32;

export class HashRing<T> {
  readonly #hash: HashFunction;
  readonly #nodeToKey: (node: T) => string;
  readonly #virtualNodes: number;
  readonly #defaultReplicaCount: number | undefined;
  readonly #nodes = new Map<string, WeightedNode<T>>();

  #ring: RingEntry<T>[] = [];
  #positions: number[] = [];

  constructor(options: HashRingOptions<T>) {
    const virtualNodes = options.virtualNodes ?? DEFAULT_VIRTUAL_NODES;
    const defaultReplicaCount = options.defaultReplicaCount;

    if (!Number.isInteger(virtualNodes) || virtualNodes < 1) {
      throw new RangeError("virtualNodes must be a positive integer");
    }

    if (
      defaultReplicaCount !== undefined &&
      (!Number.isInteger(defaultReplicaCount) || defaultReplicaCount < 1)
    ) {
      throw new RangeError("defaultReplicaCount must be a positive integer");
    }

    this.#nodeToKey = options.nodeToKey;
    this.#hash = options.hash ?? fnv1a;
    this.#virtualNodes = virtualNodes;
    this.#defaultReplicaCount = defaultReplicaCount;
  }

  addNode(node: T, weight = 1): void {
    this.#assertWeight(weight);

    const nodeId = this.#getNodeKey(node);

    this.#nodes.set(nodeId, { node, weight });
    this.#rebuildRing();
  }

  removeNode(node: T): boolean {
    const nodeId = this.#getNodeKey(node);
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

  getNodes(key: string, count = this.#defaultReplicaCount): T[] {
    if (
      count === undefined ||
      !Number.isInteger(count) ||
      count < 1 ||
      this.#ring.length === 0
    ) {
      return [];
    }

    const target = Math.min(count, this.#nodes.size);
    const seenNodeIds = new Set<string>();
    const nodes: T[] = [];
    const start = this.#findRingIndex(key);

    for (
      let offset = 0;
      offset < this.#ring.length && nodes.length < target;
      offset += 1
    ) {
      const entry = this.#ring[(start + offset) % this.#ring.length];

      if (entry && !seenNodeIds.has(entry.nodeId)) {
        seenNodeIds.add(entry.nodeId);
        nodes.push(entry.node);
      }
    }

    return nodes;
  }

  get size(): number {
    return this.#nodes.size;
  }

  get nodes(): T[] {
    return Array.from(this.#nodes.values(), ({ node }) => node);
  }

  get vnodeTotal(): number {
    return this.#ring.length;
  }

  getDistribution(): HashRingDistribution<T>[] {
    const distribution = new Map(
      Array.from(this.#nodes.entries(), ([nodeId, weightedNode]) => [
        nodeId,
        {
          nodeId,
          node: weightedNode.node,
          weight: weightedNode.weight,
          virtualNodeCount: this.#getVirtualNodeCount(weightedNode.weight),
          keyspaceShare: 0,
          keyspacePercentage: 0,
        },
      ]),
    );

    if (this.#ring.length === 0) {
      return Array.from(distribution.values());
    }

    if (this.#ring.length === 1) {
      const onlyEntry = this.#ring[0];

      if (onlyEntry) {
        const node = distribution.get(onlyEntry.nodeId);

        if (node) {
          node.keyspaceShare = 1;
          node.keyspacePercentage = 100;
        }
      }

      return Array.from(distribution.values());
    }

    for (let index = 0; index < this.#ring.length; index += 1) {
      const current = this.#ring[index];
      const previous =
        this.#ring[(index - 1 + this.#ring.length) % this.#ring.length];

      if (!current || !previous) {
        continue;
      }

      const share = this.#getKeyspaceShare(previous.position, current.position);
      const node = distribution.get(current.nodeId);

      if (node) {
        node.keyspaceShare += share;
      }
    }

    for (const node of distribution.values()) {
      node.keyspacePercentage = node.keyspaceShare * 100;
    }

    return Array.from(distribution.values());
  }

  getKeyMapping(keys: Iterable<string>): HashRingKeyMapping<T>[] {
    const mappings: HashRingKeyMapping<T>[] = [];

    for (const key of keys) {
      const node = this.getNode(key);

      mappings.push({
        key,
        node,
        nodeId: node ? this.#getNodeKey(node) : undefined,
      });
    }

    return mappings;
  }

  snapshot(): HashRingSnapshot<T> {
    const nodes = Array.from(
      this.#nodes.entries(),
      ([nodeId, weightedNode]) => ({
        nodeId,
        node: weightedNode.node,
        weight: weightedNode.weight,
        virtualNodeCount: this.#getVirtualNodeCount(weightedNode.weight),
      }),
    );

    return {
      virtualNodes: this.#virtualNodes,
      nodeCount: this.size,
      ringSize: this.vnodeTotal,
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

  #getNodeKey(node: T): string {
    const nodeKey = this.#nodeToKey(node);

    if (nodeKey.length === 0) {
      throw new Error("nodeToKey must return a non-empty string");
    }

    return nodeKey;
  }

  #getVirtualNodeCount(weight: number): number {
    return Math.max(1, Math.round(this.#virtualNodes * weight));
  }

  #getKeyspaceShare(start: number, end: number): number {
    const span = end >= start ? end - start : HASH_SPACE_SIZE - start + end;
    return span / HASH_SPACE_SIZE;
  }

  #rebuildRing(): void {
    const nextRing: RingEntry<T>[] = [];

    for (const [nodeId, weightedNode] of this.#nodes) {
      const vnodeCount = this.#getVirtualNodeCount(weightedNode.weight);

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
