type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export const enforceWindowRateLimit = (input: {
  key: string;
  limit: number;
  windowMs: number;
}) => {
  const now = Date.now();
  const bucket = buckets.get(input.key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return {
      allowed: true,
      remaining: input.limit - 1,
    };
  }

  if (bucket.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: bucket.resetAt - now,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: input.limit - bucket.count,
  };
};
