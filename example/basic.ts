import { HashRing } from "../packages/consistent-hash/src/index.js";

interface CacheNode {
  id: string;
  region: string;
}

const ring = new HashRing<CacheNode>({
  getNodeId: (node) => node.id,
  virtualNodes: 150,
});

ring.addNode({ id: "cache-sfo-1", region: "us-west" });
ring.addNode({ id: "cache-iad-1", region: "us-east" });
ring.addNode({ id: "cache-fra-1", region: "eu-central" }, 2);

const key = "user:123";
const owner = ring.getNode(key);
const replicas = ring.getNodes(key, 2);

console.log("key", key);
console.log("owner", owner);
console.log("replicas", replicas);

ring.removeNode({ id: "cache-iad-1", region: "unused-for-removal" });

console.log("owner after removal", ring.getNode(key));
