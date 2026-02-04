import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { resolve } from 'node:path';
import {
  getMigrationLockKey,
  prepareMigrationEnv,
  resolveDefaultEnv,
} from './utils';

async function runDrizzle(
  args: string[],
  envFile: string
): Promise<void> {
  const binName =
    process.platform === 'win32' ? 'drizzle-kit.cmd' : 'drizzle-kit';
  const drizzleBin = resolve(process.cwd(), 'node_modules', '.bin', binName);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(drizzleBin, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        DRIZZLE_ENV_FILE: envFile,
      },
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`drizzle-kit завершился с кодом ${code}`));
    });
  });
}

async function main() {
  const { env, envFile, dbUrl, restArgs } = prepareMigrationEnv(
    process.argv.slice(2),
    { defaultEnv: resolveDefaultEnv() }
  );

  console.log(
    `✅ Миграции запускаются для ${env}. Env-файл: ${envFile.replace(
      `${process.cwd()}/`,
      ''
    )}`
  );

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Берём advisory lock, чтобы не допустить параллельные миграции
  const lockKey = getMigrationLockKey();
  const lockResult = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [lockKey]
  );

  if (!lockResult.rows[0]?.locked) {
    await client.end();
    throw new Error(
      '❌ Не удалось получить advisory lock. Параллельный запуск миграций запрещён.'
    );
  }

  try {
    await runDrizzle(['migrate', ...restArgs], envFile);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
