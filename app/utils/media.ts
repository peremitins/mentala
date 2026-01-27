import { useRuntimeConfig } from '#imports';

let didWarnAboutBaseUrl = false;

function isAbsoluteUrl(value: string) {
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

  const { public: config } = useRuntimeConfig();
  const baseUrl =
    typeof config.mediaBaseUrl === 'string' ? config.mediaBaseUrl.trim() : '';

  if (!baseUrl) {
    // Явно логируем проблему один раз, чтобы не заспамить консоль.
    if (!didWarnAboutBaseUrl) {
      console.error(
        '[media] NUXT_PUBLIC_MEDIA_BASE_URL is empty; media URL cannot be built.'
      );
      didWarnAboutBaseUrl = true;
    }
    return '';
  }

  const safeBase = normalizeBaseUrl(baseUrl);
  const safePath = normalizePath(path);
  if (!safePath) return '';
  return `${safeBase}${safePath}`;
}
