export function consumeRateLimit(buckets, key, { max, windowMs }, currentTime = Date.now()) {
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    return true;
  }

  const bucket = buckets.get(key);
  if (!bucket || currentTime >= bucket.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: currentTime + windowMs,
    });
    return true;
  }

  if (bucket.count >= max) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function cleanupRateBuckets(buckets, currentTime = Date.now()) {
  for (const [key, bucket] of buckets.entries()) {
    if (currentTime >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}
