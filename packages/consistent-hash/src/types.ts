export type HashFunction = (input: string) => number;

export interface HashRingOptions<T> {
  nodeToKey: (node: T) => string;
  hash?: HashFunction;
  virtualNodes?: number;
  defaultReplicaCount?: number;
}

export interface WeightedNode<T> {
  node: T;
  weight: number;
}

export interface HashRingDistribution<T> {
  nodeId: string;
  node: T;
  weight: number;
  virtualNodeCount: number;
  keyspaceShare: number;
  keyspacePercentage: number;
}

export interface HashRingKeyMapping<T> {
  key: string;
  nodeId: string | undefined;
  node: T | undefined;
}

export interface HashRingNodeSnapshot<T> {
  nodeId: string;
  node: T;
  weight: number;
  virtualNodeCount: number;
}

export interface HashRingEntrySnapshot<T> {
  position: number;
  nodeId: string;
  node: T;
}

export interface HashRingSnapshot<T> {
  virtualNodes: number;
  nodeCount: number;
  ringSize: number;
  nodes: HashRingNodeSnapshot<T>[];
  entries: HashRingEntrySnapshot<T>[];
}
