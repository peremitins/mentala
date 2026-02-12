import { useRuntimeConfig } from '#imports';

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

export function resolveMediaUrl(path?: string | null): string {
  if (!path) return '';
  if (isAbsoluteUrl(path)) return path;

  const safePath = normalizePath(path);
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

  // В native dev (Android/iOS) origin часто указывает на LAN URL из capacitor server.url.
  // Если он http(s) и отличается от apiBase, берём origin как источник медиа —
  // так картинки/аудио идут с того же хоста, откуда уже грузится веб-приложение.
  const shouldUseOriginInDev =
    isDev && Boolean(origin) && Boolean(apiBaseUrl) && apiBaseUrl !== origin;

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
