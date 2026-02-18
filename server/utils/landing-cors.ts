import { getHeader, setHeader } from 'h3';

export function normalizeLandingOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function parseAllowedOrigins(): string[] {
  if (process.env.NODE_ENV === 'production') {
    return String(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => normalizeLandingOrigin(origin))
      .filter(Boolean);
  }

  const devOrigins = String(process.env.DEV_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeLandingOrigin(origin))
    .filter(Boolean);

  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];

  return [...new Set([...defaults, ...devOrigins])];
}

/** Список разрешённых origins для формы лида (тот же, что в ALLOWED_ORIGINS / DEV_ALLOWED_ORIGINS). */
export function getLandingAllowedOrigins(): string[] {
  return parseAllowedOrigins();
}

/**
 * Выставляет CORS-заголовки для эндпоинта лида (OPTIONS и POST).
 * Нужно вызывать в начале обработчика, чтобы preflight и ответы (в т.ч. 403/429)
 * всегда содержали Access-Control-* и браузер не блокировал ответ.
 * Обязателен Vary: Origin для корректного кеширования.
 */
export function setLandingCorsHeaders(event: any): void {
  const origin = getHeader(event, 'origin');
  const allowed = new Set(parseAllowedOrigins());

  if (origin && allowed.has(normalizeLandingOrigin(origin))) {
    setHeader(event, 'Access-Control-Allow-Origin', origin);
  }
  setHeader(event, 'Vary', 'Origin');
  setHeader(event, 'Access-Control-Allow-Methods', 'POST, OPTIONS');
  setHeader(event, 'Access-Control-Allow-Headers', 'content-type');
  setHeader(event, 'Access-Control-Max-Age', '86400');
}
