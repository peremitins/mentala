/**
 * Скрипт нормализации email в users (Gmail aliases, lowercase, NFKC)
 * Нужен для консистентности с normalizeEmail во всех auth-потоках
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

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

async function migrateNormalizedEmails() {
  const { db } = await import('./client');
  const { users } = await import('./schema');
  const { eq } = await import('drizzle-orm');

  const rows = await db.select({ id: users.id, email: users.email }).from(users);

  const emailToId = new Map<string, number>();
  for (const row of rows) {
    if (row.email) {
      emailToId.set(row.email, row.id);
    }
  }

  const conflicts: Array<{
    userId: number;
    email: string;
    normalized: string;
    conflictUserId: number;
  }> = [];
  const updates: Array<{ id: number; email: string }> = [];

  for (const row of rows) {
    if (!row.email) continue;
    const normalized = normalizeEmailValue(row.email);
    if (!normalized || normalized === row.email) continue;

    const conflictUserId = emailToId.get(normalized);
    if (conflictUserId && conflictUserId !== row.id) {
      conflicts.push({
        userId: row.id,
        email: row.email,
        normalized,
        conflictUserId,
      });
      continue;
    }

    emailToId.set(normalized, row.id);
    updates.push({ id: row.id, email: normalized });
  }

  if (conflicts.length > 0) {
    console.error('❌ Email normalization conflicts detected:');
    for (const conflict of conflicts) {
      console.error(
        `- userId=${conflict.userId} email=${conflict.email} -> ${conflict.normalized} conflicts with userId=${conflict.conflictUserId}`
      );
    }
    throw new Error('Resolve email conflicts before applying normalization');
  }

  if (updates.length === 0) {
    console.log('ℹ️  No emails require normalization');
    return;
  }

  const now = new Date();
  for (const update of updates) {
    await db
      .update(users)
      .set({ email: update.email, updatedAt: now })
      .where(eq(users.id, update.id));
  }

  console.log(`✅ Normalized ${updates.length} email(s)`);
}

migrateNormalizedEmails()
  .then(() => {
    console.log('✅ Email normalization completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Email normalization failed:', err);
    process.exit(1);
  });
