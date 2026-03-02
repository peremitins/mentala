import { getRequestURL } from 'h3';

export function resolveAppUrl(event: any, configuredAppUrl?: string): string {
  const requestUrl = getRequestURL(event);
  const requestOrigin = requestUrl.origin.replace(/\/+$/, '');
  const configured = (configuredAppUrl || '').replace(/\/+$/, '');
  const isProd = process.env.NODE_ENV === 'production';

  if (!configured) return requestOrigin;

  if (!isProd && configured !== requestOrigin) {
    return requestOrigin;
  }

  const configuredIsLocal =
    configured.includes('localhost') ||
    configured.includes('127.0.0.1') ||
    configured.includes('0.0.0.0');
  const requestIsLocal =
    requestOrigin.includes('localhost') ||
    requestOrigin.includes('127.0.0.1') ||
    requestOrigin.includes('0.0.0.0');

  if (configuredIsLocal && !requestIsLocal) {
    return requestOrigin;
  }

  return configured;
}

function normalizeHttpAppUrl(rawUrl?: string | null): string | null {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const pathname =
      parsed.pathname && parsed.pathname !== '/'
        ? parsed.pathname.replace(/\/+$/, '')
        : '';

    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

/**
 * Возвращает app URL для внешних redirect-flow.
 * В dev допускаем клиентский override (для LAN-тестов на девайсах),
 * в production используем только серверную конфигурацию/origin запроса.
 */
export function resolveExternalFlowAppUrl(params: {
  event: any;
  configuredAppUrl?: string;
  requestedAppUrl?: string | null;
}): string {
  const fallback = resolveAppUrl(params.event, params.configuredAppUrl);
  const requested = normalizeHttpAppUrl(params.requestedAppUrl);
  if (!requested) return fallback;

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const normalizedFallback = normalizeHttpAppUrl(fallback);
    return normalizedFallback === requested ? requested : fallback;
  }

  return requested;
}
