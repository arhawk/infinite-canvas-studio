import { describe, expect, it } from "vitest";
import { cleanupRateBuckets, consumeRateLimit } from "../../../server/src/rateLimit.js";

describe("room rate limits", () => {
  it("allows requests until the bucket reaches its limit", () => {
    const buckets = new Map();
    const options = { max: 2, windowMs: 1000 };

    expect(consumeRateLimit(buckets, "client-a", options, 100)).toBe(true);
    expect(consumeRateLimit(buckets, "client-a", options, 200)).toBe(true);
    expect(consumeRateLimit(buckets, "client-a", options, 300)).toBe(false);
  });

  it("resets a bucket after its window expires", () => {
    const buckets = new Map();
    const options = { max: 1, windowMs: 1000 };

    expect(consumeRateLimit(buckets, "client-a", options, 100)).toBe(true);
    expect(consumeRateLimit(buckets, "client-a", options, 200)).toBe(false);
    expect(consumeRateLimit(buckets, "client-a", options, 1200)).toBe(true);
  });

  it("cleans expired buckets", () => {
    const buckets = new Map([
      ["expired", { count: 1, resetAt: 100 }],
      ["active", { count: 1, resetAt: 300 }],
    ]);

    cleanupRateBuckets(buckets, 200);

    expect(buckets.has("expired")).toBe(false);
    expect(buckets.has("active")).toBe(true);
  });
});
