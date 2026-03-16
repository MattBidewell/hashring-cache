import { describe, expect, test } from "vitest";

import { fnv1a } from "./fnv1a.js";

describe("fnv1a", () => {
  test("returns stable 32-bit hashes for known inputs", () => {
    expect(fnv1a("")).toBe(2872998923);
    expect(fnv1a("a")).toBe(444641715);
    expect(fnv1a("hello")).toBe(2290972270);
    expect(fnv1a("user:123")).toBe(1888004547);
  });

  test("produces unsigned 32-bit values", () => {
    const hash = fnv1a("consistent-hash");

    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });
});
