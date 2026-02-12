import { Client } from 'pg';
import { prepareMigrationEnv, resolveDefaultEnv } from './utils';

type DuplicateStatsRow = {
  duplicate_groups: number;
  rows_to_delete: number;
};

async function main() {
  const { env, envFile, dbUrl } = prepareMigrationEnv(process.argv.slice(2), {
    defaultEnv: resolveDefaultEnv(),
  });

  console.log(
    `✅ Чистка дублей notification_slots для ${env}. Env-файл: ${envFile.replace(
      `${process.cwd()}/`,
      ''
    )}`
  );

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const statsResult = await client.query<DuplicateStatsRow>(`
      with grouped as (
        select
          user_id,
          kind,
          entity_key,
          scheduled_at,
          count(*)::int as duplicate_count
        from notification_slots
        where status in ('planned', 'queued')
        group by user_id, kind, entity_key, scheduled_at
        having count(*) > 1
      )
      select
        count(*)::int as duplicate_groups,
        coalesce(sum(duplicate_count - 1), 0)::int as rows_to_delete
      from grouped;
    `);

    const stats = statsResult.rows[0] ?? {
      duplicate_groups: 0,
      rows_to_delete: 0,
    };

    console.log(
      `[Slots Duplicates] Найдено групп дублей: ${stats.duplicate_groups}, строк к удалению: ${stats.rows_to_delete}`
    );

    if (stats.rows_to_delete === 0) {
      console.log('[Slots Duplicates] ✅ Дубликатов нет, чистка не требуется.');
      return;
    }

    const sampleResult = await client.query(`
      select
        user_id,
        kind,
        entity_key,
        scheduled_at,
        count(*)::int as duplicate_count
      from notification_slots
      where status in ('planned', 'queued')
      group by user_id, kind, entity_key, scheduled_at
      having count(*) > 1
      order by duplicate_count desc, user_id asc
      limit 20;
    `);

    console.log(
      '[Slots Duplicates] Примеры конфликтных ключей (до чистки):',
      sampleResult.rows
    );

    // Сохраняем одну запись на ключ:
    // 1) queued выше planned (чтобы не терять связанный BullMQ job),
    // 2) затем более старую created_at,
    // 3) затем id как стабильный tie-breaker.
    const deleteResult = await client.query(`
      with ranked as (
        select
          id,
          row_number() over (
            partition by user_id, kind, entity_key, scheduled_at
            order by (status = 'queued') desc, created_at asc, id asc
          ) as rn
        from notification_slots
        where status in ('planned', 'queued')
      ),
      to_delete as (
        select id
        from ranked
        where rn > 1
      )
      delete from notification_slots
      where id in (select id from to_delete);
    `);

    console.log(
      `[Slots Duplicates] ✅ Удалено строк: ${deleteResult.rowCount ?? 0}`
    );

    const verifyResult = await client.query<DuplicateStatsRow>(`
      with grouped as (
        select
          user_id,
          kind,
          entity_key,
          scheduled_at,
          count(*)::int as duplicate_count
        from notification_slots
        where status in ('planned', 'queued')
        group by user_id, kind, entity_key, scheduled_at
        having count(*) > 1
      )
      select
        count(*)::int as duplicate_groups,
        coalesce(sum(duplicate_count - 1), 0)::int as rows_to_delete
      from grouped;
    `);

    const after = verifyResult.rows[0] ?? {
      duplicate_groups: 0,
      rows_to_delete: 0,
    };
    console.log(
      `[Slots Duplicates] После чистки: групп дублей=${after.duplicate_groups}, строк к удалению=${after.rows_to_delete}`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

