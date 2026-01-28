import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { prepareMigrationEnv } from './utils';

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
  const { env, envFile, restArgs } = prepareMigrationEnv(
    process.argv.slice(2),
    { defaultEnv: 'development' }
  );

  // Для генерации по умолчанию используем development, если --env не задан
  console.log(
    `✅ Генерация миграций для ${env}. Env-файл: ${envFile.replace(
      `${process.cwd()}/`,
      ''
    )}`
  );

  await runDrizzle(['generate', ...restArgs], envFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
