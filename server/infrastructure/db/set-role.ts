/**
 * Скрипт для назначения роли пользователю по email
 * Использование: pnpm tsx server/infrastructure/db/set-role.ts <email> <role>
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

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

const validRoles = ['admin', 'user', 'moderator', 'support'];

async function setRole(email: string, role: string) {
  // Динамический импорт после загрузки env
  const { db } = await import('./client');
  const { users } = await import('./schema');
  const { eq } = await import('drizzle-orm');
  if (!validRoles.includes(role)) {
    throw new Error(
      `Invalid role: ${role}. Valid roles: ${validRoles.join(', ')}`
    );
  }

  const [user] = await db
    .update(users)
    .set({ roleId: role })
    .where(eq(users.email, email.toLowerCase().trim()))
    .returning();

  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }

  console.log(`✅ User ${email} is now ${role}`);
}

// Использование: pnpm tsx server/infrastructure/db/set-role.ts <email> <role>
const email = process.argv[2];
const role = process.argv[3];

if (!email || !role) {
  console.error(
    'Usage: pnpm tsx server/infrastructure/db/set-role.ts <email> <role>'
  );
  console.error(`Valid roles: ${validRoles.join(', ')}`);
  process.exit(1);
}

setRole(email, role)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });

