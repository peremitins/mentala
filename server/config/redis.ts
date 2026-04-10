import { isStaticGenerateProcess } from '@/server/utils/static-generate';

function normalizeEnvString(value: string | undefined): string | undefined {
  const normalized = String(value || '').trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readRedisPort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > 65535) {
    return fallback;
  }

  return normalized;
}

const isStaticBuild = isStaticGenerateProcess();
const isProduction = process.env.NODE_ENV === 'production';

// REDIS_REQUIRE_AUTH=false явно отключает проверку пароля (например, для dev-окружения,
// где Redis запущен без requirepass). По умолчанию проверка включена в production.
const requireAuthEnv = normalizeEnvString(process.env.REDIS_REQUIRE_AUTH);
const isPasswordRequired =
  isProduction &&
  !isStaticBuild &&
  requireAuthEnv !== 'false';

export const redisConfig = {
  // Для local dev оставляем loopback по умолчанию.
  host: normalizeEnvString(process.env.REDIS_HOST) || '127.0.0.1',
  port: readRedisPort(process.env.REDIS_PORT, 6379),
  password: normalizeEnvString(process.env.REDIS_PASSWORD),
  isStaticBuild,
  isProduction,
  isPasswordRequired,
};

export function assertRedisConfig(): void {
  if (!redisConfig.isPasswordRequired || redisConfig.password) {
    return;
  }

  throw new Error(
    '[Redis] REDIS_PASSWORD обязателен в production. Укажи пароль в server env или выставь REDIS_REQUIRE_AUTH=false для окружений без auth.'
  );
}
