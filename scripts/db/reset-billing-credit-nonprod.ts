import { Client } from 'pg';
import { prepareMigrationEnv, resolveDefaultEnv } from './utils';

async function main() {
  const { env, envFile, dbUrl } = prepareMigrationEnv(process.argv.slice(2), {
    defaultEnv: resolveDefaultEnv(),
  });

  // Дополнительный hard-stop на случай ручной подмены env.
  if (env === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error(
      '❌ Сброс billing_credit запрещён в production. Используй development/stage.'
    );
  }

  console.log(
    `✅ Сброс billing_credit для ${env}. Env-файл: ${envFile.replace(
      `${process.cwd()}/`,
      ''
    )}`
  );

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const before = await client.query<{
      users_with_credit: number;
      total_credit: string;
    }>(`
      select
        count(*) filter (where billing_credit::numeric > 0)::int as users_with_credit,
        coalesce(sum(billing_credit::numeric), 0)::text as total_credit
      from users;
    `);
    const beforeRow = before.rows[0];

    console.log(
      `[BillingCredit] До сброса: users_with_credit=${beforeRow?.users_with_credit ?? 0}, total_credit=${beforeRow?.total_credit ?? '0'}`
    );

    const resetResult = await client.query(`
      update users
      set billing_credit = 0,
          updated_at = now()
      where billing_credit::numeric <> 0;
    `);

    console.log(
      `[BillingCredit] ✅ Обновлено пользователей: ${resetResult.rowCount ?? 0}`
    );

    const after = await client.query<{
      users_with_credit: number;
      total_credit: string;
    }>(`
      select
        count(*) filter (where billing_credit::numeric > 0)::int as users_with_credit,
        coalesce(sum(billing_credit::numeric), 0)::text as total_credit
      from users;
    `);
    const afterRow = after.rows[0];
    console.log(
      `[BillingCredit] После сброса: users_with_credit=${afterRow?.users_with_credit ?? 0}, total_credit=${afterRow?.total_credit ?? '0'}`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
