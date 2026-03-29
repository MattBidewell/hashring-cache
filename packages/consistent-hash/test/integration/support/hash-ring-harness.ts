import { HashRing } from "../../../src/index.js";

export interface CacheNode {
  id: string;
  region: string;
  weight: number;
}

export const BASELINE_NODES: CacheNode[] = [
  { id: "cache-a", region: "us-west", weight: 1 },
  { id: "cache-b", region: "us-east", weight: 2 },
  { id: "cache-c", region: "eu-central", weight: 1 },
];

export const INTEGRATION_KEYS = Array.from({ length: 512 }, (_, index) => `user:${index}`);

export function createHashRingHarness(seedNodes: CacheNode[] = BASELINE_NODES) {
  const ring = new HashRing<CacheNode>({
    nodeToKey: (node) => node.id,
    virtualNodes: 80,
    defaultReplicaCount: 2,
  });

  const addNodes = (nodes: CacheNode[]): void => {
    for (const node of nodes) {
      ring.addNode(node, node.weight);
    }
  };

  const captureAssignments = (
    keys: string[] = INTEGRATION_KEYS,
  ): Map<string, string | undefined> => {
    const assignments = new Map<string, string | undefined>();

    for (const key of keys) {
      assignments.set(key, ring.getNode(key)?.id);
    }

    return assignments;
  };

  const removeById = (nodeId: string): boolean => {
    return ring.removeNode({ id: nodeId, region: "cleanup", weight: 1 });
  };

  const reset = (): void => {
    for (const node of [...ring.nodes]) {
      ring.removeNode(node);
    }
  };

  return {
    ring,
    seed: () => addNodes(seedNodes),
    addNodes,
    captureAssignments,
    removeById,
    reset,
  };
}
