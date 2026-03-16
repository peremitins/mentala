import { useRuntimeConfig } from '#imports';
import meditationImageMap from '@/scripts/meditation-image-map.json';

/** Карта старых путей (устаревшие хеши) → актуальные пути для CDN */
const MEDITATION_PATH_MAP = meditationImageMap as Record<string, string>;

let didWarnAboutBaseUrl = false;

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `/${trimmed.replace(/^\/+/, '')}`;
}

/**
 * Подставляет актуальный путь вместо устаревшего (например, старый content-hash).
 * Решает проблему 404 на проде, когда БД содержит старые хеши (08de5010),
 * а на CDN загружены файлы с новыми (ed61a3eb).
 */
function resolveMeditationPath(path: string): string {
  const normalized = normalizePath(path);
  return MEDITATION_PATH_MAP[normalized] ?? normalized;
}

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return '';
  if (isAbsoluteUrl(path)) return path;

  // Подставляем актуальный путь для медитаций (обратная совместимость со старыми хешами в БД)
  const resolvedPath = resolveMeditationPath(path);
  const safePath = normalizePath(resolvedPath);
  if (!safePath) return '';

  const { public: config } = useRuntimeConfig();
  const mediaBaseUrl =
    typeof config.mediaBaseUrl === 'string' ? config.mediaBaseUrl.trim() : '';
  const apiBaseUrl =
    typeof config.apiBase === 'string' ? config.apiBase.trim() : '';
  const isDev = config.isDev === true;
  const origin =
    typeof window !== 'undefined' && isHttpUrl(window.location.origin)
      ? window.location.origin
      : '';
  const isNativeRuntime =
    typeof window !== 'undefined' &&
    typeof (window as any).Capacitor?.isNativePlatform === 'function' &&
    Boolean((window as any).Capacitor.isNativePlatform());

  // В native dev (Android/iOS) приоритетно используем origin (server.url),
  // чтобы медиа шли с того же хоста, что и само приложение.
  // Это критично для сценариев, когда CDN недоступен в эмуляторе/девайсе,
  // но dev-server доступен по LAN.
  const shouldUseOriginInDev =
    isDev &&
    Boolean(origin) &&
    (isNativeRuntime || (Boolean(apiBaseUrl) && apiBaseUrl !== origin));

  // Приоритеты:
  // dev: origin (если отличается от apiBase) -> apiBase -> mediaBaseUrl
  // prod: mediaBaseUrl -> apiBase -> origin
  const baseUrl = isDev
    ? shouldUseOriginInDev
      ? origin
      : apiBaseUrl || mediaBaseUrl || origin
    : mediaBaseUrl || apiBaseUrl || origin;

  if (!baseUrl) {
    // Явно логируем проблему один раз, чтобы не заспамить консоль.
    if (!didWarnAboutBaseUrl) {
      console.error(
        '[media] Media base URL is empty; fallback to relative path.'
      );
      didWarnAboutBaseUrl = true;
    }
    return safePath;
  }

  const safeBase = normalizeBaseUrl(baseUrl);
  return `${safeBase}${safePath}`;
}
