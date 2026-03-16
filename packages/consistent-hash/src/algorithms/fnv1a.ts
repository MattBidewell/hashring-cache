import type { HashFunction } from "../types.js";

/**
 * FNV-1a 32-bit hash function implementation with finalizer from MurmurHash3 for improved avalanche effect.
 *
 * @param input hashable input
 * @returns 32-bit hash value
 */
export const fnv1a: HashFunction = (input) => {
  let hash = 0x811c9dc5; // FNV offset basis

  // FNV-1a hashing
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }

  // Finalizer from MurmurHash3 to improve avalanche effect
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b); // MurmurHash3 Hamming weight
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35); // MurmurHash3 prime-like constant
  hash ^= hash >>> 16;

  return hash >>> 0;
};
