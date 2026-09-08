import { useRuntimeConfig } from '#imports';
import meditationImageMap from '@/scripts/meditation-image-map.json';
import { isHttpUrl, resolveMediaBaseUrl } from '@/app/utils/media-base';

/** Карта старых путей (устаревшие хеши) → актуальные пути для CDN */
const MEDITATION_PATH_MAP = meditationImageMap as Record<string, string>;

let didWarnAboutBaseUrl = false;

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
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
    typeof (window as CapacitorWindow).Capacitor?.isNativePlatform ===
      'function' &&
    Boolean((window as CapacitorWindow).Capacitor?.isNativePlatform?.());

  // В native dev используем origin только если приложение реально поднято
  // с внешнего dev-server. Для локального bundle на localhost медиа должны
  // идти в api/mediaBase, иначе нативный аудио-движок получает неверный URL.
  const baseUrl = resolveMediaBaseUrl({
    isDev,
    isNativeRuntime,
    origin,
    apiBaseUrl,
    mediaBaseUrl,
  });

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

  return `${baseUrl}${safePath}`;
}
