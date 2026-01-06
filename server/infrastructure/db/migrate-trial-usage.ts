/**
 * Скрипт миграции trial_usage_tracking для существующих пользователей
 * Запускать после применения миграции БД
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
config({ path: envPath });

const defaultEnvResult = config({ path: resolve(process.cwd(), '.env') });
if (defaultEnvResult.error) {
  console.warn('Warning: Could not load .env:', defaultEnvResult.error.message);
}

if (!process.env.NUXT_PRIVATE_DB_URL) {
  console.error(
    '❌ Error: NUXT_PRIVATE_DB_URL is not set in environment variables'
  );
  console.error('Please check your .env or .env.development file');
  process.exit(1);
}

if (!process.env.EMAIL_HASH_PEPPER) {
  console.error('❌ Error: EMAIL_HASH_PEPPER is not set');
  process.exit(1);
}

function normalizeEmailValue(email: string): string {
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

function hashEmailValue(emailNormalized: string): string {
  return createHmac('sha256', process.env.EMAIL_HASH_PEPPER || '')
    .update(emailNormalized)
    .digest('hex');
}

async function migrateTrialUsage() {
  const { db } = await import('./client');
  const { users, trialUsageTracking } = await import('./schema');
  const { and, eq, isNotNull } = await import('drizzle-orm');

  const now = new Date();
  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      trialStartedAt: users.trialStartedAt,
      trialEndedAt: users.trialEndedAt,
      hasUsedTrial: users.hasUsedTrial,
    })
    .from(users)
    .where(and(eq(users.hasUsedTrial, true), isNotNull(users.trialStartedAt)));

  if (candidates.length === 0) {
    console.log('ℹ️  No users to migrate for trial usage tracking');
    return;
  }

  const rows = candidates
    .map((user) => {
      if (!user.email || !user.trialStartedAt) return null;
      const emailNormalized = normalizeEmailValue(user.email);
      const emailHash = hashEmailValue(emailNormalized);

      const endedAt = user.trialEndedAt;
      const trialExpired = endedAt ? endedAt < now : false;
      const diffMs = now.getTime() - user.trialStartedAt.getTime();
      const usedDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
      const totalDaysUsed = trialExpired ? 7 : Math.min(7, usedDays);
      const updatedAt =
        endedAt && endedAt < now ? endedAt : user.trialStartedAt;

      return {
        emailNormalized,
        emailHash,
        firstTrialStartedAt: user.trialStartedAt,
        lastTrialStartedAt: user.trialStartedAt,
        totalDaysUsed,
        updatedAt,
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    console.log('ℹ️  No valid users to migrate for trial usage tracking');
    return;
  }

  await db
    .insert(trialUsageTracking)
    .values(rows as Array<(typeof trialUsageTracking)['$inferInsert']>)
    .onConflictDoNothing({ target: trialUsageTracking.emailHash });

  console.log(
    `✅ Migrated ${rows.length} user(s) into trial_usage_tracking`
  );
}

migrateTrialUsage()
  .then(() => {
    console.log('✅ Trial usage migration completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Trial usage migration failed:', err);
    process.exit(1);
  });
