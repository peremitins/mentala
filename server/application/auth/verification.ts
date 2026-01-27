import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { useRuntimeConfig } from '#imports';
import { redisConnection } from '@/server/infrastructure/redis/bullmqClient';

const CODE_TTL_SECONDS = 15 * 60;
const MAX_CODE_ATTEMPTS = 5;

export type VerificationRecord = {
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
};

export function normalizeEmail(email: string): string {
  if (!email) return '';

  let normalized = email.trim().toLowerCase();
  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain) {
    return normalized.normalize('NFKC');
  }

  const gmailDomains = ['gmail.com', 'googlemail.com'];
  if (gmailDomains.includes(domain)) {
    let gmailLocal = localPart.replace(/\./g, '');
    gmailLocal = gmailLocal.split('+')[0];
    normalized = `${gmailLocal}@${domain}`;
  }

  return normalized.normalize('NFKC');
}

export function getEmailHashPepper(): string {
  const cfg = useRuntimeConfig();
  const pepper = cfg.emailHashPepper || process.env.EMAIL_HASH_PEPPER || '';
  if (!pepper) {
    throw new Error('EMAIL_HASH_PEPPER is missing');
  }
  return pepper;
}

export function hashEmail(emailNormalized: string): string {
  return createHmac('sha256', getEmailHashPepper())
    .update(emailNormalized)
    .digest('hex');
}

export function getEmailVerificationKey(email: string): string {
  return `auth:email_verification:${email}`;
}

export function getEmailPasswordKey(email: string): string {
  return `auth:email_verification_password:${email}`;
}

export function generateVerificationCode(): string {
  const value = randomInt(0, 1_000_000);
  return value.toString().padStart(6, '0');
}

export function getAuthSecrets(): string[] {
  const cfg = useRuntimeConfig();
  const current =
    cfg.authEmailCodeSecret || process.env.AUTH_EMAIL_CODE_SECRET || '';
  const previous =
    cfg.authEmailCodeSecretPrevious ||
    process.env.AUTH_EMAIL_CODE_SECRET_PREVIOUS ||
    '';

  const secrets = [current, previous].filter((s) => s && s.length > 0);
  if (!secrets.length) {
    throw new Error('AUTH_EMAIL_CODE_SECRET is missing');
  }
  return secrets;
}

export function hashVerificationCode(code: string, secret: string): string {
  return createHash('sha256').update(`${code}${secret}`).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function storeVerificationRecord(
  key: string,
  codeHash: string,
  ttlSeconds: number = CODE_TTL_SECONDS
): Promise<VerificationRecord> {
  const now = Date.now();
  const record: VerificationRecord = {
    codeHash,
    attempts: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
  };
  await redisConnection.set(key, JSON.stringify(record), 'EX', ttlSeconds);
  return record;
}

export async function getVerificationRecord(
  key: string
): Promise<VerificationRecord | null> {
  const raw = await redisConnection.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerificationRecord;
  } catch (error) {
    console.error('[Auth] Failed to parse verification record:', error);
    return null;
  }
}

export async function updateVerificationRecord(
  key: string,
  record: VerificationRecord
): Promise<void> {
  const ttl = await redisConnection.ttl(key);
  const ttlSeconds = ttl > 0 ? ttl : CODE_TTL_SECONDS;
  record.expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await redisConnection.set(key, JSON.stringify(record), 'EX', ttlSeconds);
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'expired' | 'invalid' | 'attempts_exceeded';
      attemptsLeft?: number;
    };

export async function verifyStoredCode(
  key: string,
  code: string,
  secrets: string[] = getAuthSecrets(),
  maxAttempts: number = MAX_CODE_ATTEMPTS
): Promise<VerifyResult> {
  const record = await getVerificationRecord(key);
  if (!record) {
    return { ok: false, reason: 'expired' };
  }

  if (record.attempts >= maxAttempts) {
    return { ok: false, reason: 'attempts_exceeded', attemptsLeft: 0 };
  }

  const isValid = secrets.some((secret) =>
    timingSafeEqualHex(record.codeHash, hashVerificationCode(code, secret))
  );

  if (!isValid) {
    record.attempts += 1;
    await updateVerificationRecord(key, record);
    const attemptsLeft = Math.max(0, maxAttempts - record.attempts);
    return {
      ok: false,
      reason: attemptsLeft === 0 ? 'attempts_exceeded' : 'invalid',
      attemptsLeft,
    };
  }

  return { ok: true };
}

export async function storeTempPasswordHash(
  key: string,
  passwordHash: string,
  ttlSeconds: number = CODE_TTL_SECONDS
): Promise<void> {
  await redisConnection.set(key, passwordHash, 'EX', ttlSeconds);
}

export async function getTempPasswordHash(key: string): Promise<string | null> {
  const value = await redisConnection.get(key);
  return value || null;
}

export async function deleteRedisKey(key: string): Promise<void> {
  await redisConnection.del(key);
}

export function getPasswordResetKey(tokenHash: string): string {
  return `auth:password_reset:${tokenHash}`;
}

export function hashPasswordResetToken(token: string, secret: string): string {
  return createHash('sha256').update(`${token}${secret}`).digest('hex');
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***@***';

  const maskedLocal = localPart.length > 1 ? `${localPart[0]}***` : '***';

  const [domainName, ...domainParts] = domain.split('.');
  const maskedDomain =
    domainName && domainName.length > 1 ? `${domainName[0]}***` : '***';

  const tld = domainParts.length > 0 ? domainParts.join('.') : '';
  return `${maskedLocal}@${maskedDomain}${tld ? '.' + tld : ''}`;
}

export type PasswordResetRecord = {
  email: string;
  createdAt: string;
};

export async function storePasswordResetToken(
  tokenHash: string,
  email: string,
  ttlSeconds: number = 3600
): Promise<void> {
  const record: PasswordResetRecord = {
    email,
    createdAt: new Date().toISOString(),
  };
  await redisConnection.set(
    getPasswordResetKey(tokenHash),
    JSON.stringify(record),
    'EX',
    ttlSeconds
  );
}

export async function getPasswordResetRecord(
  tokenHash: string
): Promise<PasswordResetRecord | null> {
  const raw = await redisConnection.get(getPasswordResetKey(tokenHash));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PasswordResetRecord;
  } catch (error) {
    console.error('[Auth] Failed to parse password reset record:', error);
    return null;
  }
}

export const AUTH_CODE_TTL_SECONDS = CODE_TTL_SECONDS;
export const AUTH_MAX_CODE_ATTEMPTS = MAX_CODE_ATTEMPTS;
export const PASSWORD_RESET_TTL_SECONDS = 3600; // 1 час
