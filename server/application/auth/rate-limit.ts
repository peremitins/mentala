import { redisConnection } from '@/server/infrastructure/redis/bullmqClient';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const count = await redisConnection.incr(key);
  if (count === 1) {
    await redisConnection.expire(key, windowSeconds);
  }

  const remaining = Math.max(0, limit - count);
  if (count <= limit) {
    return { allowed: true, remaining };
  }

  const ttl = await redisConnection.ttl(key);
  const retryAfter = ttl > 0 ? ttl : windowSeconds;
  return { allowed: false, remaining, retryAfter };
}
