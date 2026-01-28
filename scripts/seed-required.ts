/**
 * Skript dlya inicial'nogo seeda bazovykh tablits (pod pustuyu BД).
 * Запускает nuzhnye seed-skripty posledovatel'no i avto-bail pri oshibke.
 */

// # Прод (пустая БД)
// pnpm seed:required -- --env=production
// # Прод, без перезалива шаблонов уведомлений (если таблицы уже не пустые)
// pnpm seed:required -- --env=production --skip-templates
// # Прод + назначение админов из ADMIN_EMAILS (если пользователи уже существуют)
// pnpm seed:required -- --env=production --with-admins

import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

type SeedTask = {
  name: string;
  command: string;
  args: string[];
};

const args = process.argv.slice(2);

function getArgValue(flag: string): string | null {
  const idx = args.findIndex(
    (item) => item === flag || item.startsWith(`${flag}=`)
  );
  if (idx === -1) return null;
  const value = args[idx].includes('=')
    ? args[idx].split('=')[1]
    : args[idx + 1];
  if (!value || value.startsWith('-')) return null;
  return value;
}

function hasFlag(flag: string): boolean {
  return (
    args.includes(flag) || args.some((item) => item.startsWith(`${flag}=`))
  );
}

const helpRequested = hasFlag('--help') || hasFlag('-h');
if (helpRequested) {
  console.log(
    `\nИспользование:\n  pnpm seed:required -- --env=production [--with-admins] [--skip-templates] [--database-url=...]\n\nОпции:\n  --env=production|development  Какое окружение использовать (по умолчанию: NODE_ENV или development)\n  --database-url              Явно задать NUXT_PRIVATE_DB_URL (перекрывает .env файлы)\n  --with-admins               Дополнительно выполнить миграцию админов из ADMIN_EMAILS\n  --skip-templates            Пропустить перенос шаблонов уведомлений в БД\n`
  );
  process.exit(0);
}

const envArg = getArgValue('--env');
const envName = (envArg || process.env.NODE_ENV || 'development').toLowerCase();
const envFileName =
  envName === 'production' ? '.env.production' : '.env.development';

const databaseUrlArg = getArgValue('--database-url');
if (databaseUrlArg) {
  process.env.NUXT_PRIVATE_DB_URL = databaseUrlArg;
}

function loadEnvFile(fileName: string) {
  const fullPath = resolve(process.cwd(), fileName);
  const result = config({ path: fullPath, override: false });
  if (result.error) {
    console.warn(`Warning: Could not load ${fileName}:`, result.error.message);
  }
  return result;
}

loadEnvFile(envFileName);
loadEnvFile('.env');
const withAdmins = hasFlag('--with-admins');
const skipTemplates = hasFlag('--skip-templates');

const tasks: SeedTask[] = [
  {
    name: 'roles',
    command: 'pnpm',
    args: ['tsx', 'server/infrastructure/db/seed-roles.ts'],
  },
  {
    name: 'subscription-plans',
    command: 'pnpm',
    args: ['tsx', 'server/infrastructure/db/seed-subscription-plans.ts'],
  },
  {
    name: 'meditations',
    command: 'pnpm',
    args: ['tsx', 'server/infrastructure/db/seed-meditations.ts'],
  },
];

if (!skipTemplates) {
  tasks.push({
    name: 'notification-templates',
    command: 'pnpm',
    args: ['tsx', 'scripts/migrate-templates-to-db.ts'],
  });
}

if (withAdmins) {
  tasks.push({
    name: 'admins',
    command: 'pnpm',
    args: ['tsx', 'server/infrastructure/db/migrate-admins.ts'],
  });
}

async function runTask(task: SeedTask): Promise<void> {
  // Передаём NODE_ENV в дочерний процесс, чтобы seed-skripty podbrali .env/.env.development
  const child = spawn(task.command, task.args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: envName,
      NUXT_PRIVATE_DB_URL: process.env.NUXT_PRIVATE_DB_URL,
    },
  });

  await new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(`Seed task "${task.name}" failed with exit code ${code}`)
      );
    });
    child.on('error', (error) => reject(error));
  });
}

async function run(): Promise<void> {
  console.log(`🚀 Seed start (env=${envName})`);

  if (!process.env.NUXT_PRIVATE_DB_URL) {
    throw new Error(
      'NUXT_PRIVATE_DB_URL is required. Pass it via --database-url=... or set env NUXT_PRIVATE_DB_URL before running.'
    );
  }

  for (const task of tasks) {
    console.log(`\n➡️  Running: ${task.name}`);
    await runTask(task);
  }

  console.log('\n✅ Seed completed');
}

run().catch((error) => {
  console.error('\n❌ Seed failed:', error);
  process.exit(1);
});
