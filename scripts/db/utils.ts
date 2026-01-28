import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export type MigrationEnv = 'development' | 'production';

export interface EnvParseResult {
  env: MigrationEnv;
  restArgs: string[];
}

export interface PreparedEnv {
  env: MigrationEnv;
  envFile: string;
  dbUrl: string;
  restArgs: string[];
}

const ENV_ARG = '--env';

export function parseEnvArg(
  args: string[],
  options?: { defaultEnv?: MigrationEnv }
): EnvParseResult {
  let envValue: string | undefined;
  const restArgs: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      continue;
    }
    if (arg === ENV_ARG) {
      envValue = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith(`${ENV_ARG}=`)) {
      envValue = arg.slice(`${ENV_ARG}=`.length);
      continue;
    }
    restArgs.push(arg);
  }

  if (!envValue && options?.defaultEnv) {
    return { env: options.defaultEnv, restArgs };
  }

  if (!envValue) {
    throw new Error(
      '❌ Не указан --env. Используй --env=development или --env=production.'
    );
  }

  if (envValue !== 'development' && envValue !== 'production') {
    throw new Error(
      `❌ Недопустимый --env=${envValue}. Допустимы только development | production.`
    );
  }

  return { env: envValue, restArgs } as EnvParseResult;
}

export function resolveEnvFile(env: MigrationEnv): string {
  const explicitEnvFile =
    process.env.DRIZZLE_ENV_FILE || process.env.MIGRATE_ENV_FILE;
  if (explicitEnvFile) {
    const resolved = resolve(process.cwd(), explicitEnvFile);
    if (!existsSync(resolved)) {
      throw new Error(`❌ Явный env-файл не найден: ${resolved}`);
    }
    return resolved;
  }

  if (env === 'development') {
    const devFile = resolve(process.cwd(), '.env.development');
    if (!existsSync(devFile)) {
      throw new Error('❌ Файл .env.development не найден.');
    }
    return devFile;
  }

  const prodFile = resolve(process.cwd(), '.env.production');
  if (existsSync(prodFile)) {
    return prodFile;
  }

  const serverFile = resolve(process.cwd(), '.env');
  if (!existsSync(serverFile)) {
    throw new Error('❌ Файлы .env.production и .env не найдены для production.');
  }
  return serverFile;
}

export function loadEnvFile(envFile: string): void {
  const result = config({ path: envFile });
  if (result.error) {
    throw new Error(
      `❌ Не удалось загрузить env-файл: ${envFile}. ${result.error.message}`
    );
  }
  // Явно фиксируем выбранный env-файл для drizzle.config.ts
  process.env.DRIZZLE_ENV_FILE = envFile;
}

export function assertProdConfirm(env: MigrationEnv): void {
  if (env !== 'production') return;
  if (process.env.MIGRATE_PROD_CONFIRM !== 'YES') {
    throw new Error(
      '❌ Для production требуется подтверждение: MIGRATE_PROD_CONFIRM=YES.'
    );
  }
}

export function assertDbEnv(expected: MigrationEnv): void {
  const dbEnv = process.env.MENTALA_DB_ENV;
  if (!dbEnv) {
    throw new Error(
      '❌ MENTALA_DB_ENV не задан. Укажи development | production в env-файле.'
    );
  }
  if (dbEnv !== expected) {
    throw new Error(
      `❌ Несовпадение окружения: выбран ${expected}, а MENTALA_DB_ENV=${dbEnv}.`
    );
  }
}

export function getDbUrl(): string {
  const dbUrl = process.env.NUXT_PRIVATE_DB_URL;
  if (!dbUrl) {
    throw new Error(
      '❌ NUXT_PRIVATE_DB_URL не найден. Проверь env-файл для миграций.'
    );
  }
  return dbUrl;
}

export function prepareMigrationEnv(
  args: string[],
  options?: {
    defaultEnv?: MigrationEnv;
    requireProdConfirm?: boolean;
  }
): PreparedEnv {
  const { env, restArgs } = parseEnvArg(args, options);
  const envFile = resolveEnvFile(env);

  process.env.NODE_ENV = env === 'production' ? 'production' : 'development';

  loadEnvFile(envFile);
  if (options?.requireProdConfirm ?? true) {
    assertProdConfirm(env);
  }
  assertDbEnv(env);

  const dbUrl = getDbUrl();

  return { env, envFile, dbUrl, restArgs };
}

export function getMigrationLockKey(): string {
  // Стабильный ключ для advisory lock (64-bit на базе SHA-256)
  const hash = createHash('sha256')
    .update('mentala:db:migrations')
    .digest();
  const high = hash.readUInt32BE(0);
  const low = hash.readUInt32BE(4);
  const unsignedKey = (BigInt(high) << 32n) | BigInt(low);
  const signedLimit = 1n << 63n;
  const fullRange = 1n << 64n;
  const signedKey =
    unsignedKey >= signedLimit ? unsignedKey - fullRange : unsignedKey;
  return signedKey.toString();
}
