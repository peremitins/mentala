import { Client } from 'pg';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  getMigrationLockKey,
  prepareMigrationEnv,
} from './utils';

interface JournalEntry {
  when: number;
  tag: string;
}

function getLatestJournalEntry(migrationsFolder: string): JournalEntry {
  const journalPath = resolve(migrationsFolder, 'meta', '_journal.json');
  const journalRaw = readFileSync(journalPath, 'utf-8');
  const journal = JSON.parse(journalRaw) as { entries: JournalEntry[] };

  if (!journal.entries.length) {
    throw new Error('❌ _journal.json пуст. Базовая миграция невозможна.');
  }

  return journal.entries.reduce((latest, entry) =>
    entry.when > latest.when ? entry : latest
  );
}

async function main() {
  const { env, envFile, dbUrl } = prepareMigrationEnv(process.argv.slice(2));

  console.log(
    `✅ Baseline запускается для ${env}. Env-файл: ${envFile.replace(
      `${process.cwd()}/`,
      ''
    )}`
  );

  const migrationsFolder = resolve(
    process.cwd(),
    'server',
    'infrastructure',
    'db',
    'migrations'
  );

  const migrations = readMigrationFiles({ migrationsFolder });
  if (!migrations.length) {
    throw new Error('❌ Миграции не найдены. Baseline не имеет смысла.');
  }

  // Берём последнюю миграцию из журнала, чтобы зафиксировать baseline
  const latestEntry = getLatestJournalEntry(migrationsFolder);
  const latestMigration = migrations.find(
    (migration) => migration.folderMillis === latestEntry.when
  );

  if (!latestMigration) {
    throw new Error(
      `❌ Не найдено соответствие для последней миграции ${latestEntry.tag}.`
    );
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const lockKey = getMigrationLockKey();
  const lockResult = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [lockKey]
  );

  if (!lockResult.rows[0]?.locked) {
    await client.end();
    throw new Error(
      '❌ Не удалось получить advisory lock. Параллельный запуск запрещён.'
    );
  }

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text as count FROM drizzle.__drizzle_migrations'
    );
    const count = Number(countResult.rows[0]?.count || '0');

    if (count > 0) {
      console.log('ℹ️ Baseline уже применён. Таблица __drizzle_migrations не пуста.');
      return;
    }

    await client.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [latestMigration.hash, latestMigration.folderMillis]
    );

    console.log(
      `✅ Baseline применён: ${latestEntry.tag} (created_at=${latestMigration.folderMillis})`
    );
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
