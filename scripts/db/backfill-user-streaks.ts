import { Client } from 'pg';
import { prepareMigrationEnv, resolveDefaultEnv } from './utils';

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year = 1970, month = 1, day = 1] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function getRepairPeriod(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function buildState(dates: string[]) {
  let current = 0;
  let best = 0;
  let lastDate: string | null = null;

  for (const date of dates) {
    if (lastDate && shiftDateKey(lastDate, 1) === date) {
      current += 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    lastDate = date;
  }

  if (!lastDate) return null;
  return {
    best,
    current,
    lastActivityDate: lastDate,
    repairPeriod: getRepairPeriod(lastDate),
  };
}

async function main() {
  const { env, envFile, dbUrl } = prepareMigrationEnv(process.argv.slice(2), {
    defaultEnv: resolveDefaultEnv(),
    requireProdConfirm: false,
  });

  console.log(
    `[streak:backfill] env=${env} file=${envFile.replace(`${process.cwd()}/`, '')}`
  );

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const existingRows = await client.query<{ count: number }>(`
      select count(*)::int as count
      from user_streaks;
    `);
    const userRows = await client.query<{ id: number }>(`
      select id
      from users
      where id not in (select user_id from user_streaks)
      order by id;
    `);

    let created = 0;
    let skippedWithoutActivity = 0;

    for (const user of userRows.rows) {
      const activityRows = await client.query<{ date: string }>(
        `
          select distinct date
          from (
            select event_date as date
            from energy_events
            where user_id = $1
            union
            select entry_date as date
            from mood_checkins
            where user_id = $1
          ) activity
          order by date;
        `,
        [user.id]
      );
      const state = buildState(activityRows.rows.map((row) => row.date));
      if (!state) {
        skippedWithoutActivity += 1;
        continue;
      }

      await client.query('begin');
      try {
        await client.query(
          `
            insert into user_streaks (
              user_id,
              current,
              best,
              status,
              last_activity_date,
              repair_period,
              repair_used,
              metadata,
              updated_at
            )
            values ($1, $2, $3, 'active', $4, $5, 0, '{"source":"backfill"}'::jsonb, now())
            on conflict (user_id) do nothing;
          `,
          [
            user.id,
            state.current,
            state.best,
            state.lastActivityDate,
            state.repairPeriod,
          ]
        );
        await client.query(
          `
            insert into user_streak_events (
              user_id,
              type,
              event_date,
              previous_current,
              current,
              metadata
            )
            values ($1, 'started', $2, 0, $3, '{"source":"backfill"}'::jsonb);
          `,
          [user.id, state.lastActivityDate, state.current]
        );
        await client.query('commit');
        created += 1;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log(
      `[streak:backfill] created=${created} skipped_existing=${existingRows.rows[0]?.count ?? 0} skipped_without_activity=${skippedWithoutActivity}`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[streak:backfill] failed:', error);
  process.exitCode = 1;
});
