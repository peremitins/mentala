import { defineEventHandler } from 'h3';

const isProd = process.env.NODE_ENV === 'production';

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function parseOrigins(envValue?: string): string[] {
  return (envValue || '')
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);
}

function getAllowedOrigins(): string[] {
  const base = new Set<string>(['capacitor://localhost', 'ionic://localhost']);

  if (isProd) {
    const fromEnv = process.env.PUBLIC_APP_ORIGIN
      ? [process.env.PUBLIC_APP_ORIGIN]
      : parseOrigins(process.env.ALLOWED_ORIGINS);

    if (!fromEnv.length) {
      throw new Error(
        'PUBLIC_APP_ORIGIN or ALLOWED_ORIGINS must be set in production'
      );
    }

    for (const o of fromEnv) base.add(o);
    return [...base];
  }

  const fromEnv = parseOrigins(process.env.DEV_ALLOWED_ORIGINS);
  // В dev всегда разрешаем стандартные локальные origins для web-приложения и лендинга.
  const defaults = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
  for (const o of defaults) base.add(o);
  for (const o of fromEnv) base.add(o);

  return [...base];
}

const allowedOrigins = new Set(getAllowedOrigins());

const allowHeaders =
  'Content-Type, Authorization, X-Requested-With, X-Session-Token, X-Timezone, X-Platform, X-App-Env, X-CSRF-Token, Idempotency-Key';

export default defineEventHandler((event) => {
  const req = event.node.req;
  const res = event.node.res;

  const origin = req.headers.origin;
  const normalizedOrigin = origin ? normalizeOrigin(origin) : '';
  if (!origin) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
    }
    return;
  }

  if (!allowedOrigins.has(normalizedOrigin)) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
    }
    return;
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS,PATCH'
  );
  res.setHeader('Access-Control-Allow-Headers', allowHeaders);
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
  }
});
