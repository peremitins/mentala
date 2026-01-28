import { Client } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareMigrationEnv } from './utils';
import * as schema from '../../server/infrastructure/db/schema';

type TableLike = {
  $tableName: string;
  $columns: Record<string, { name: string }>;
};

const trackedTables: TableLike[] = Object.values(schema).filter(
  (item): item is TableLike =>
    !!item &&
    typeof item === 'object' &&
    '$tableName' in item &&
    '$columns' in item
);

function getColumnNames(table: { $columns: Record<string, { name: string }> }) {
  return Object.values(table.$columns).map((column) => column.name);
}

async function verifyTable(client: Client, table: any) {
  const tableName = table.$tableName;
  const schemaColumns = getColumnNames(table);

  const result = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  const dbColumns = result.rows.map((row) => row.column_name);

  const missingColumns = schemaColumns.filter(
    (column) => !dbColumns.includes(column)
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `Таблица ${tableName} содержит недостающие поля: ${missingColumns.join(', ')}`
    );
  }
}

async function main() {
  const { envFile, dbUrl } = prepareMigrationEnv(process.argv.slice(2), {
    requireProdConfirm: false,
    defaultEnv: 'development',
  });
  console.log(
    `📋 Проверяем соответствие схемы (${envFile.replace(`${process.cwd()}/`, '')})`
  );
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Показываем, к какой базе реально подключились (частая причина "призрачных" расхождений).
    const connInfo = await client.query<{
      db: string;
      user: string;
      host: string | null;
      port: number | null;
      search_path: string;
    }>(
      "SELECT current_database() AS db, current_user AS user, inet_server_addr() AS host, inet_server_port() AS port, current_setting('search_path') AS search_path"
    );
    const info = connInfo.rows[0];
    console.log(
      `🔗 DB=${info?.db || '?'} user=${info?.user || '?'} host=${info?.host || '?'} port=${info?.port || '?'} search_path=${info?.search_path || '?'}`
    );

    // Сверяем количество миграций в коде и в БД.
    const migrationsDir = resolve(
      process.cwd(),
      'server/infrastructure/db/migrations'
    );
    const migrationFiles = readdirSync(migrationsDir).filter((name) =>
      name.endsWith('.sql')
    );
    const migrationTags = migrationFiles.map((name) => name.replace('.sql', ''));

    // Проверяем, что все .sql файлы зарегистрированы в _journal.json.
    const journalPath = resolve(migrationsDir, 'meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
      entries: { tag: string }[];
    };
    const journalTags = (journal.entries || []).map((entry) => entry.tag);
    const missingInJournal = migrationTags.filter(
      (tag) => !journalTags.includes(tag)
    );
    if (missingInJournal.length > 0) {
      throw new Error(
        `В _journal.json отсутствуют записи для миграций: ${missingInJournal.join(', ')}`
      );
    }
    let dbMigrationsCount = 0;
    try {
      const dbMigrations = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations'
      );
      dbMigrationsCount = dbMigrations.rows[0]?.count ?? 0;
    } catch (error: any) {
      throw new Error(
        'Таблица drizzle.__drizzle_migrations не найдена. Миграции не применялись.'
      );
    }

    if (dbMigrationsCount !== migrationFiles.length) {
      throw new Error(
        `Несовпадение миграций: в коде ${migrationFiles.length}, в БД ${dbMigrationsCount}.`
      );
    }

    for (const table of trackedTables) {
      await verifyTable(client, table);
    }
    console.log('✅ Все ключевые таблицы содержат ожидаемые поля.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Проверка схемы завершилась с ошибкой:', error.message);
  process.exitCode = 1;
});
