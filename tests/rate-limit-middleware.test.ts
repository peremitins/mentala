import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// В unit-тестах запускаем middleware как чистую функцию.
// Подменяем h3, чтобы не тянуть полный Nuxt runtime.
vi.mock('h3', () => ({
  defineEventHandler: (handler: any) => handler,
  setResponseStatus: (
    event: any,
    statusCode: number,
    statusMessage?: string
  ) => {
    event.node.res.statusCode = statusCode;
    if (statusMessage) {
      event.node.res.statusMessage = statusMessage;
    }
  },
  getHeader: (event: any, name: string) => {
    const headerName = name.toLowerCase();
    return event?.node?.req?.headers?.[headerName] ?? null;
  },
}));

let config: (typeof import('../server/config'))['config'];
let rateLimitMiddleware: (event: any) => void;

type MockEventOptions = {
  path: string;
  xForwardedFor?: string;
  xRealIp?: string;
  remoteAddress?: string;
};

function createMockEvent(options: MockEventOptions): any {
  const headers: Record<string, string> = {};
  if (options.xForwardedFor) {
    headers['x-forwarded-for'] = options.xForwardedFor;
  }
  if (options.xRealIp) {
    headers['x-real-ip'] = options.xRealIp;
  }

  const responseState = {
    headers: {} as Record<string, string>,
    ended: false,
    body: '',
    statusCode: 200,
    statusMessage: 'OK',
    setHeader(name: string, value: string) {
      this.headers[name] = String(value);
    },
    end(body?: string) {
      this.ended = true;
      this.body = body ?? '';
    },
  };

  return {
    path: options.path,
    node: {
      req: {
        url: options.path,
        headers,
        socket: {
          remoteAddress: options.remoteAddress ?? '127.0.0.1',
        },
      },
      res: responseState,
    },
  };
}

describe('Global rate-limit middleware', () => {
  let originalWindowMs = 60_000;
  let originalMax = 180;

  beforeAll(async () => {
    const configModule = await import('../server/config');
    const middlewareModule = await import('../server/middleware/rate-limit');
    config = configModule.config;
    rateLimitMiddleware = middlewareModule.default as (event: any) => void;
    originalWindowMs = config.rateLimit.windowMs;
    originalMax = config.rateLimit.max;
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    config.rateLimit.windowMs = originalWindowMs;
    config.rateLimit.max = originalMax;
    vi.useRealTimers();
  });

  it('не ограничивает non-API маршруты', () => {
    // Ставим жёсткий лимит, чтобы тест явно проверял пропуск non-API.
    config.rateLimit.max = 1;
    config.rateLimit.windowMs = 60_000;

    const nonApiPath = '/health';
    const ip = '198.51.100.10';

    // Несколько non-API запросов не должны расходовать лимит.
    rateLimitMiddleware(
      createMockEvent({ path: nonApiPath, xForwardedFor: ip })
    );
    rateLimitMiddleware(
      createMockEvent({ path: nonApiPath, xForwardedFor: ip })
    );

    const firstApi = createMockEvent({ path: '/api/ping', xForwardedFor: ip });
    rateLimitMiddleware(firstApi);

    expect(firstApi.node.res.ended).toBe(false);
    expect(firstApi.node.res.statusCode).toBe(200);
  });

  it('не возвращает 429 до достижения лимита на API', () => {
    config.rateLimit.max = 180;
    config.rateLimit.windowMs = 60_000;

    for (let i = 0; i < 180; i += 1) {
      const event = createMockEvent({
        path: '/api/test',
        xForwardedFor: '198.51.100.20',
      });
      rateLimitMiddleware(event);

      expect(event.node.res.ended).toBe(false);
      expect(event.node.res.statusCode).toBe(200);
    }
  });

  it('возвращает 429 на 181-м API запросе и выставляет Retry-After', () => {
    config.rateLimit.max = 180;
    config.rateLimit.windowMs = 60_000;

    for (let i = 0; i < 180; i += 1) {
      rateLimitMiddleware(
        createMockEvent({
          path: '/api/test',
          xForwardedFor: '198.51.100.30',
        })
      );
    }

    const blockedEvent = createMockEvent({
      path: '/api/test',
      xForwardedFor: '198.51.100.30',
    });
    rateLimitMiddleware(blockedEvent);

    expect(blockedEvent.node.res.ended).toBe(true);
    expect(blockedEvent.node.res.statusCode).toBe(429);
    expect(blockedEvent.node.res.statusMessage).toBe('Too Many Requests');
    expect(blockedEvent.node.res.headers['Retry-After']).toBe('60');
    expect(blockedEvent.node.res.body).toBe('Rate limit exceeded');
  });

  it('сбрасывает счётчик после завершения окна', () => {
    config.rateLimit.max = 2;
    config.rateLimit.windowMs = 20;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T00:00:00.000Z'));

    const ip = '198.51.100.40';
    rateLimitMiddleware(
      createMockEvent({ path: '/api/test', xForwardedFor: ip })
    );
    rateLimitMiddleware(
      createMockEvent({ path: '/api/test', xForwardedFor: ip })
    );

    const blockedEvent = createMockEvent({
      path: '/api/test',
      xForwardedFor: ip,
    });
    rateLimitMiddleware(blockedEvent);
    expect(blockedEvent.node.res.statusCode).toBe(429);

    // Прокручиваем время за пределы окна и проверяем, что лимит снова открыт.
    vi.setSystemTime(new Date('2026-02-15T00:00:00.030Z'));
    const allowedAfterWindow = createMockEvent({
      path: '/api/test',
      xForwardedFor: ip,
    });
    rateLimitMiddleware(allowedAfterWindow);

    expect(allowedAfterWindow.node.res.ended).toBe(false);
    expect(allowedAfterWindow.node.res.statusCode).toBe(200);
  });

  it('использует нормализованный IP ключ (стратегия getClientIp)', () => {
    config.rateLimit.max = 1;
    config.rateLimit.windowMs = 60_000;

    // Первый запрос с IPv4-mapped IPv6.
    rateLimitMiddleware(
      createMockEvent({
        path: '/api/test',
        xForwardedFor: '::ffff:203.0.113.77',
      })
    );

    // Второй запрос с тем же IP в нормальном IPv4 формате должен попасть в тот же bucket.
    const blockedEvent = createMockEvent({
      path: '/api/test',
      xForwardedFor: '203.0.113.77',
    });
    rateLimitMiddleware(blockedEvent);

    expect(blockedEvent.node.res.statusCode).toBe(429);
    expect(blockedEvent.node.res.ended).toBe(true);
  });
});
