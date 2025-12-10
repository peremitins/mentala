import { config } from 'dotenv';
import { resolve } from 'node:path';

// Загружаем переменные окружения из .env.development или .env
const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
config({ path: resolve(process.cwd(), envFile) });
// Также загружаем .env на случай, если .env.development не существует
config({ path: resolve(process.cwd(), '.env') });

const dbUrl = process.env.NUXT_PRIVATE_DB_URL;

if (!dbUrl) {
  throw new Error(
    '❌ NUXT_PRIVATE_DB_URL не найдена в переменных окружения. ' +
      'Убедитесь, что файл .env.development или .env существует и содержит NUXT_PRIVATE_DB_URL.'
  );
}

export default {
  schema: './server/infrastructure/db/schema.ts',
  out: './server/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
} as const;
