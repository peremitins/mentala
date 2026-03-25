/**
 * Обновляет coverPath/backgroundPath у медитаций на версионированные файлы.
 * Запускать после переименования картинок и перед выкладкой без purge.
 */

// Загружаем переменные окружения ПЕРЕД импортом client
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { eq } from 'drizzle-orm';

const cwd = process.cwd();
const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
config({ path: resolve(cwd, envFile) });

// .env — опциональный override
if (existsSync(resolve(cwd, '.env'))) {
  config({ path: resolve(cwd, '.env') });
}

// Fallback: если NODE_ENV=production, но .env пуст — пробуем .env.development
// (удобно для миграций с локальной машины, когда прод URL в .env.development)
if (!process.env.NUXT_PRIVATE_DB_URL && existsSync(resolve(cwd, '.env.development'))) {
  config({ path: resolve(cwd, '.env.development') });
}

if (!process.env.NUXT_PRIVATE_DB_URL) {
  console.error(
    '❌ Error: NUXT_PRIVATE_DB_URL is not set in environment variables'
  );
  console.error(
    'Add it to .env, .env.development or .env.production, or pass via env'
  );
  process.exit(1);
}

const MAP_PATH = resolve(process.cwd(), 'scripts/meditation-image-map.json');

async function runUpdate() {
  const { db } = await import('./client');
  const { meditationTracks } = await import('./schema');

  const raw = await fs.readFile(MAP_PATH, 'utf8');
  const mapping = JSON.parse(raw) as Record<string, string>;

  const entries = Object.entries(mapping);
  if (!entries.length) {
    console.log('ℹ️  Карта картинок пуста, обновлять нечего.');
    return;
  }

  console.log('🔁 Обновляем coverPath/backgroundPath для медитаций...');

  const now = new Date();
  let updated = 0;

  for (const [oldPath, newPath] of entries) {
    const coverResult = await db
      .update(meditationTracks)
      .set({ coverPath: newPath, updatedAt: now })
      .where(eq(meditationTracks.coverPath, oldPath))
      .returning({ id: meditationTracks.id });

    const backgroundResult = await db
      .update(meditationTracks)
      .set({ backgroundPath: newPath, updatedAt: now })
      .where(eq(meditationTracks.backgroundPath, oldPath))
      .returning({ id: meditationTracks.id });

    updated += coverResult.length + backgroundResult.length;
  }

  console.log(`✅ Обновлено записей: ${updated}`);
}

runUpdate().catch((error) => {
  console.error('❌ Ошибка при обновлении путей картинок:', error);
  process.exit(1);
});
