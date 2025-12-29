import { randomBytes } from 'node:crypto';
import { redisConnection } from '@/server/infrastructure/redis/bullmqClient';
import type { Provider } from './oauth';

const LINK_TTL_SECONDS = 15 * 60;
const MAX_LINK_ATTEMPTS = 5;

export type OAuthLinkData = {
  provider: Provider;
  providerUserId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  attempts: number;
  createdAt: string;
};

export function generateLinkingToken(): string {
  return randomBytes(32).toString('hex');
}

export function getLinkingKey(token: string): string {
  return `auth:oauth_link:${token}`;
}

export function getLinkCodeKey(token: string): string {
  return `auth:oauth_link_code:${token}`;
}

export async function storeLinkingData(
  token: string,
  data: Omit<OAuthLinkData, 'attempts' | 'createdAt'>,
  ttlSeconds: number = LINK_TTL_SECONDS
): Promise<OAuthLinkData> {
  const record: OAuthLinkData = {
    ...data,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  await redisConnection.set(
    getLinkingKey(token),
    JSON.stringify(record),
    'EX',
    ttlSeconds
  );
  return record;
}

export async function getLinkingData(
  token: string
): Promise<OAuthLinkData | null> {
  const raw = await redisConnection.get(getLinkingKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthLinkData;
  } catch (error) {
    console.error('[Auth] Failed to parse OAuth link data:', error);
    return null;
  }
}

export async function updateLinkingData(
  token: string,
  data: OAuthLinkData
): Promise<void> {
  const ttl = await redisConnection.ttl(getLinkingKey(token));
  const ttlSeconds = ttl > 0 ? ttl : LINK_TTL_SECONDS;
  await redisConnection.set(
    getLinkingKey(token),
    JSON.stringify(data),
    'EX',
    ttlSeconds
  );
}

export async function deleteLinkingData(token: string): Promise<void> {
  await redisConnection.del(getLinkingKey(token));
}

export async function registerLinkAttempt(
  token: string,
  data: OAuthLinkData
): Promise<{ allowed: boolean; attemptsLeft: number }> {
  if (data.attempts >= MAX_LINK_ATTEMPTS) {
    return { allowed: false, attemptsLeft: 0 };
  }
  data.attempts += 1;
  await updateLinkingData(token, data);
  const attemptsLeft = Math.max(0, MAX_LINK_ATTEMPTS - data.attempts);
  return { allowed: attemptsLeft > 0, attemptsLeft };
}

export const LINKING_TTL_SECONDS = LINK_TTL_SECONDS;
export const LINKING_MAX_ATTEMPTS = MAX_LINK_ATTEMPTS;
