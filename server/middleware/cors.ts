import { defineEventHandler } from 'h3';

export default defineEventHandler((event) => {
  const req = event.node.req;
  const res = event.node.res;

  // Разрешенные origins для CORS
  // Включаем стандартные web origins и Capacitor origins
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost:8080',
  ];

  // Получаем origin из заголовка запроса
  const origin = req.headers.origin || req.headers.referer;

  // Проверяем, разрешен ли origin
  let allowedOrigin: string | undefined = undefined;

  if (origin) {
    // Извлекаем origin из referer если нужно
    // Для referer берем только origin часть (без пути)
    let originUrl = origin;
    if (origin.includes('://')) {
      try {
        const url = new URL(origin);
        originUrl = `${url.protocol}//${url.host}`;
      } catch {
        // Если не получается распарсить, используем как есть
        originUrl = origin.replace(/\/$/, '');
      }
    } else {
      originUrl = origin.replace(/\/$/, '');
    }

    // Проверяем точное совпадение или начинается с разрешенного
    const isAllowed = allowedOrigins.some((allowed) => {
      // Для localhost разрешаем любые порты и протоколы
      if (allowed.includes('localhost')) {
        return originUrl.includes('localhost');
      }
      return originUrl === allowed || originUrl.startsWith(allowed);
    });

    if (isAllowed) {
      allowedOrigin = originUrl;
    }
  }

  // Если origin не разрешен, используем конкретный origin из запроса (не wildcard)
  // для Capacitor это важно - если не установить origin, запрос будет заблокирован
  if (!allowedOrigin && origin) {
    // В dev режиме разрешаем localhost origins
    const originUrl = origin.includes('://')
      ? (() => {
          try {
            const url = new URL(origin);
            return `${url.protocol}//${url.host}`;
          } catch {
            return origin.replace(/\/$/, '');
          }
        })()
      : origin.replace(/\/$/, '');

    if (originUrl.includes('localhost')) {
      allowedOrigin = originUrl;
    }
  }

  // Устанавливаем CORS заголовки
  // Используем конкретный origin вместо wildcard для поддержки credentials
  // Если allowedOrigin не определен, используем origin из запроса или wildcard только для не-credentials запросов
  let finalOrigin = '*';
  if (allowedOrigin) {
    finalOrigin = allowedOrigin;
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else if (origin) {
    // Если origin есть в запросе, используем его (fallback для dev)
    const originUrl = origin.includes('://')
      ? (() => {
          try {
            const url = new URL(origin);
            return `${url.protocol}//${url.host}`;
          } catch {
            return origin.replace(/\/$/, '');
          }
        })()
      : origin.replace(/\/$/, '');
    finalOrigin = originUrl;
    res.setHeader('Access-Control-Allow-Origin', originUrl);
  } else {
    // В крайнем случае используем wildcard (но это не будет работать с credentials)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,DELETE,OPTIONS,PATCH'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-Session-Token, x-session-token'
  );

  // Обязательно нужно для работы с credentials: 'include'
  // НО нельзя использовать вместе с wildcard '*'
  if (finalOrigin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Обработка preflight запросов
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
});
