/**
 * Скрипт для миграции админов из ADMIN_EMAILS env переменной
 * Запускать после применения миграции БД
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

// Загружаем env
const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
config({ path: envPath });

// Загружаем .env как fallback
const defaultEnvResult = config({ path: resolve(process.cwd(), '.env') });
if (defaultEnvResult.error) {
  console.warn('Warning: Could not load .env:', defaultEnvResult.error.message);
}

// Проверяем наличие обязательной переменной
if (!process.env.NUXT_PRIVATE_DB_URL) {
  console.error(
    '❌ Error: NUXT_PRIVATE_DB_URL is not set in environment variables'
  );
  console.error('Please check your .env or .env.development file');
  process.exit(1);
}

async function migrateAdmins() {
  // Динамический импорт после загрузки env
  const { db } = await import('./client');
  const { users } = await import('./schema');
  const { inArray } = await import('drizzle-orm');
  const adminEmails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.warn('⚠️  ADMIN_EMAILS is not set, skipping admin migration');
    return;
  }

  console.log(
    `🔄 Migrating ${adminEmails.length} admin(s) from ADMIN_EMAILS...`
  );

  const updated = await db
    .update(users)
    .set({ roleId: 'admin' })
    .where(inArray(users.email, adminEmails))
    .returning();

  console.log(`✅ Migrated ${updated.length} user(s) to admin role:`);
  updated.forEach((u) => console.log(`   - ${u.email}`));

  const notFound = adminEmails.filter(
    (email) => !updated.some((u) => u.email?.toLowerCase() === email)
  );
  if (notFound.length > 0) {
    console.warn(`⚠️  Users not found (emails from ADMIN_EMAILS):`);
    notFound.forEach((email) => console.warn(`   - ${email}`));
  }
}

migrateAdmins()
  .then(() => {
    console.log('✅ Admin migration completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Admin migration failed:', err);
    process.exit(1);
  });

