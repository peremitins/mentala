/**
 * Обновляет audioPath у медитаций на версионированные файлы (content-hash).
 * Запускать после переименования файлов и перед выкладкой без purge.
 */

// Загружаем переменные окружения ПЕРЕД импортом client
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { eq } from 'drizzle-orm';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
const envPath = resolve(process.cwd(), envFile);
const envResult = config({ path: envPath });
if (envResult.error && envFile !== '.env') {
  console.warn(`Warning: Could not load ${envFile}:`, envResult.error.message);
}

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

const MAP_PATH = resolve(process.cwd(), 'scripts/meditation-audio-map.json');

async function runUpdate() {
  const { db } = await import('./client');
  const { meditationTracks } = await import('./schema');

  const raw = await fs.readFile(MAP_PATH, 'utf8');
  const mapping = JSON.parse(raw) as Record<string, string>;

  const entries = Object.entries(mapping);
  if (!entries.length) {
    console.log('ℹ️  Карта аудио пуста, обновлять нечего.');
    return;
  }

  console.log('🔁 Обновляем audioPath для медитаций...');

  const now = new Date();
  let updated = 0;

  for (const [oldPath, newPath] of entries) {
    const result = await db
      .update(meditationTracks)
      .set({ audioPath: newPath, updatedAt: now })
      .where(eq(meditationTracks.audioPath, oldPath))
      .returning({ id: meditationTracks.id });

    updated += result.length;
  }

  console.log(`✅ Обновлено записей: ${updated}`);
}

runUpdate().catch((error) => {
  console.error('❌ Ошибка при обновлении путей медиа:', error);
  process.exit(1);
});
