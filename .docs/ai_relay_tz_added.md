Ниже — обновлённое дополнение к ТЗ для сервиса Relay (ai-relay) с учётом решений:

1. Каноническая схема подписи — как в базовом ТЗ (`ai_relay_tz.md`).
2. Один эндпоинт `/v1/responses`.
3. Relay проксирует raw SSE OpenAI; парсинг делает `relayClient`.
4. TTL подписи — 60 секунд.
5. `OPENAI_REQUESTS_DISABLED` остаётся как сейчас.

---

## 1) Цель и смысл (что и зачем делаем)

### 1.1. Проблема

Основной сервер приложения (Россия, Яндекс, VDSina, любой российский хостинг) не должен напрямую обращаться к OpenAI API, потому что:

- юридически и организационно проще изолировать провайдера в отдельном узле,
- технически снижается риск блокировок и нестабильности,
- секреты OpenAI (ключи) не должны находиться в российском контуре,
- можно централизованно вводить лимиты, логирование, трассировку, ретраи, идемпотентность.

### 1.2. Решение

Создается отдельный сервис `ai-relay`, который разворачивается на зарубежном сервере и выступает прокси-шлюзом:

- принимает запросы от твоего основного backend,
- валидирует авторизацию и сигнатуру,
- пересылает запросы в OpenAI Responses API,
- возвращает ответ обратно,
- умеет работать и в режиме обычного ответа, и в режиме стрима.

### 1.3. Границы ответственности

Relay:

- НЕ хранит пользовательские данные в базе.
- НЕ реализует бизнес-логику чатов и уведомлений.
- НЕ подменяет промпты и не “улучшает” их.
- Делает ровно одну работу: безопасно доставить запрос в OpenAI и вернуть ответ.

---

## 2) Встраивание в текущую кодовую базу

### 2.1. Где лежит код

В текущем репозитории `frontend` (который на самом деле монорепа) создается приложение:

- `apps/ai-relay`

Рядом с твоими `server/`, `shared/` и так далее.

### 2.2. Что уже есть у тебя

По твоему коду видно:

- есть `server/infrastructure/llm/openai.ts`
- есть `relayClient` с методами `relayResponsesRequest` и `relayResponsesStream`
- есть флаг отключения OpenAI: `OPENAI_REQUESTS_DISABLED = true`
- используется `Responses API` (`/v1/responses`)
- в стриме ты обрабатываешь `response.output_text.delta` и `response.completed`

Relay должен соответствовать этой модели.

---

## 3) Контракт API Relay

### 3.1. Базовый URL

Relay разворачивается на отдельном домене, например:

- `https://relay.mentala.app`

### 3.2. Эндпоинты

1. `POST /v1/responses`

- тело: JSON, полностью совместимое с OpenAI Responses API body (ты уже формируешь его в `openai.ts`)
- заголовки, которые передает основной сервер:

  - `X-Relay-Client`
  - `X-Relay-Timestamp`
  - `X-Relay-Nonce`
  - `X-Relay-Signature`
  - `X-Request-Id` (опционально)
  - `X-Purpose` (опционально, для логов)

2. `GET /health`

- возвращает JSON `{ ok: true }`

### 3.3. Формат стрима (важно)

Relay **не меняет формат** стрима и проксирует **raw SSE OpenAI**. Парсинг событий выполняет `relayClient` на стороне основного сервера, извлекая только `response.output_text.delta`.

**Важно:** проксируем **байты как есть** (Buffer → ответ), без преобразования в строку, чтобы не было перекодировки потока.  
**Не делать** `toString()` и **не склеивать** чанки в строку — писать `chunk` как `Buffer`.

---

## 4) Безопасность

### 4.1. Авторизация

Relay НЕ должен быть публично доступным прокси.

Минимум:

- HMAC-подпись запроса с секретом `RELAY_SHARED_SECRET`

**Каноническая строка (ровно как в базовом ТЗ):**

`METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256_HEX\nCLIENT_ID`

Заголовки:

- `X-Relay-Client`
- `X-Relay-Timestamp`
- `X-Relay-Nonce`
- `X-Relay-Signature` = base64(hmac_sha256(secret, canonicalString))

**Критично:** хеш тела считается от **сырых байт** (один `JSON.stringify`, эти же байты уходят в сеть).
**Валидация подписи:** `X-Relay-Signature` строго base64, при невалидном base64 — 401.

**Raw body обязателен:** Relay берёт тело запроса в байтах **до парсинга** (через fastify raw body plugin или `preParsing` hook), сохраняет как `Buffer` и хеширует именно этот `Buffer`.
**SHA-256 считается от Buffer**, а не от строки.

**Канонический способ (обязателен) для Fastify:** регистрируем content-type parser для `application/json`, который читает тело как `Buffer`, кладёт его в `req.rawBody`, а затем парсит JSON **из этого же Buffer**. Это гарантирует байт‑в‑байт соответствие подписи.

#### 4.1.1. Реализация rawBody в Fastify (обязательно)

Relay **обязан** получать `rawBody` как `Buffer` **до парсинга** и класть его в `req.rawBody`. Каноническая реализация для Fastify (без плагинов):

```ts
// ВАЖНО: этот parser гарантирует, что rawBody = исходные байты запроса.
// Fastify будет вызывать его ДО того, как req.body станет объектом.
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (req, body, done) => {
    (req as any).rawBody = body as Buffer;
    try {
      const json = JSON.parse((body as Buffer).toString('utf-8'));
      done(null, json);
    } catch (err) {
      done(err as Error, undefined as any);
    }
  }
);
```

После этого в handler можно безопасно использовать `(req as any).rawBody as Buffer`.

### 4.2. Защита от повторов

Минимальная:

- проверка timestamp (TTL 60 секунд)
- timestamp передаётся как **epoch milliseconds** (число в миллисекундах, как `Date.now()`)
- nonce хранится в in-memory кеше с TTL (например 120 секунд)

Если захочешь жестче:

- добавляешь `X-Request-Id` и in-memory set на 5 минут.

**Важно про масштабирование:** in-memory nonce-cache работает только на одной инстанции. При 2+ инстанциях под балансером нужен общий storage (например Redis) для защиты от повторов.

**Важно по заголовкам:** канонические имена — `X-Purpose`, `X-Request-Id`, но в Node/Fastify они приходят в lower-case (`req.headers['x-purpose']`, `req.headers['x-request-id']`). Это норма.

### 4.3. Секреты

Только на Relay:

- `OPENAI_API_KEY`

Shared:

- `RELAY_SHARED_SECRET`

---

## 5) Логирование и приватность

### 5.1. В продакшене

Нельзя логировать:

- полный prompt
- пользовательский текст

Можно логировать:

- длину body
- sha256 body
- purpose
- status
- latency
- responseId

---

## 6) Ограничения и таймауты

Relay обязан:

- ставить таймаут на запрос в OpenAI (например 30 секунд, для стрима выше)
- ограничивать размер входящего JSON, например 1 мегабайт
- ограничивать параллелизм (опционально)
- по возможности прокидывать диагностические заголовки OpenAI (request id, rate limit), но для MVP не обязательно

---

## 7) Полный код (минимально-достаточный MVP)

Ниже код Node.js + TypeScript + Fastify, без магии. Он:

- проверяет HMAC подпись
- проксирует `POST /v1/responses`
- проксирует raw SSE OpenAI без преобразования
- отдает `/health`

### 7.1. Структура файлов

```
apps/ai-relay/
  package.json
  tsconfig.json
  Dockerfile
  .env.example
  src/
    fastify.d.ts
    index.ts
    server.ts
    config.ts
    auth.ts
    openai.ts
    sse.ts
    types.ts
    utils.ts
```

---

### 7.2. `apps/ai-relay/package.json`

```json
{
  "name": "ai-relay",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "node --env-file=.env --loader ts-node/esm src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --env-file=.env dist/index.js"
  },
  "dependencies": {
    "fastify": "4.29.1",
    "pino": "9.4.0",
    "undici": "6.21.0"
  },
  "devDependencies": {
    "@types/node": "22.13.1",
    "ts-node": "10.9.2",
    "typescript": "5.7.3"
  }
}
```

---

### 7.3. `apps/ai-relay/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"]
}
```

---

### 7.4. `apps/ai-relay/.env.example`

```bash
NODE_ENV=production
PORT=8080

OPENAI_API_KEY=replace_me
OPENAI_BASE_URL=https://api.openai.com

RELAY_SHARED_SECRET=replace_me

RELAY_MAX_BODY_BYTES=1048576
RELAY_SIGNATURE_TTL_MS=60000

OPENAI_TIMEOUT_MS=30000
OPENAI_STREAM_TIMEOUT_MS=120000
```

---

### 7.5. `apps/ai-relay/Dockerfile`

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

---

### 7.6. `apps/ai-relay/src/config.ts`

```ts
export function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || String(v).trim().length === 0) {
    throw new Error(`Missing env: ${name}`);
  }
  return String(v);
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),

  openai: {
    apiKey: mustGetEnv('OPENAI_API_KEY'),
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(
      /\/+$/,
      ''
    ),
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),
    streamTimeoutMs: Number(process.env.OPENAI_STREAM_TIMEOUT_MS || 120000),
  },

  relay: {
    sharedSecret: mustGetEnv('RELAY_SHARED_SECRET'),
    maxBodyBytes: Number(process.env.RELAY_MAX_BODY_BYTES || 1048576),
    signatureTtlMs: Number(process.env.RELAY_SIGNATURE_TTL_MS || 60000),
  },
};
```

---

### 7.7. `apps/ai-relay/src/fastify.d.ts`

```ts
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}
```

---

### 7.8. `apps/ai-relay/src/types.ts`

```ts
export type RelayPurpose =
  | 'chat'
  | 'chat_stream'
  | 'chips'
  | 'finish_session'
  | 'notification'
  | 'other';

export type StreamEvent = {
  type: 'raw';
  data: Buffer;
};
```

---

### 7.9. `apps/ai-relay/src/auth.ts`

```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from './config';

const NONCE_TTL_MS = 120_000;

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacBase64(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64');
}

function isValidBase64(value: string): boolean {
  if (!value) return false;
  if (value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function safeEqualBase64(a: string, b: string): boolean {
  if (!isValidBase64(a)) return false;
  const ab = Buffer.from(a, 'base64');
  const bb = Buffer.from(b, 'base64');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const seenNonces = new Map<string, number>();

function purgeNonces(now: number): void {
  for (const [key, ts] of seenNonces.entries()) {
    if (now - ts > NONCE_TTL_MS) {
      seenNonces.delete(key);
    }
  }
}

function isNonceUsed(nonce: string, now: number): boolean {
  const ts = seenNonces.get(nonce);
  if (!ts) return false;
  if (now - ts > NONCE_TTL_MS) {
    seenNonces.delete(nonce);
    return false;
  }
  return true;
}

function rememberNonce(nonce: string, now: number): void {
  seenNonces.set(nonce, now);
}

export function verifyRelaySignature(params: {
  req: FastifyRequest;
  rawBody: Buffer;
  method: string;
  path: string;
}): void {
  const tsHeader = params.req.headers['x-relay-timestamp'];
  const clientHeader = params.req.headers['x-relay-client'];
  const nonceHeader = params.req.headers['x-relay-nonce'];
  const sigHeader = params.req.headers['x-relay-signature'];

  const ts = typeof tsHeader === 'string' ? Number(tsHeader) : NaN;
  if (!Number.isFinite(ts)) {
    throw Object.assign(new Error('Missing or invalid x-relay-timestamp'), {
      statusCode: 401,
    });
  }

  const clientId = typeof clientHeader === 'string' ? clientHeader : '';
  if (!clientId) {
    throw Object.assign(new Error('Missing x-relay-client'), {
      statusCode: 401,
    });
  }

  const nonce = typeof nonceHeader === 'string' ? nonceHeader : '';
  if (!nonce) {
    throw Object.assign(new Error('Missing x-relay-nonce'), {
      statusCode: 401,
    });
  }

  const sig = typeof sigHeader === 'string' ? sigHeader : '';
  if (!sig || !isValidBase64(sig)) {
    throw Object.assign(new Error('Invalid base64 in x-relay-signature'), {
      statusCode: 401,
    });
  }

  const now = Date.now();
  const age = Math.abs(now - ts);
  if (age > config.relay.signatureTtlMs) {
    throw Object.assign(new Error('Relay signature expired'), {
      statusCode: 401,
    });
  }

  purgeNonces(now);
  if (isNonceUsed(nonce, now)) {
    throw Object.assign(new Error('Relay nonce already used'), {
      statusCode: 401,
    });
  }

  const bodyHash = sha256Hex(params.rawBody);
  const canonical = [
    params.method.toUpperCase(),
    params.path,
    String(ts),
    nonce,
    bodyHash,
    clientId,
  ].join('
');
  const expected = hmacBase64(config.relay.sharedSecret, canonical);

  if (!safeEqualBase64(sig, expected)) {
    throw Object.assign(new Error('Invalid relay signature'), {
      statusCode: 401,
    });
  }

  rememberNonce(nonce, now);
}
```

---

### 7.10. `apps/ai-relay/src/openai.ts` `apps/ai-relay/src/openai.ts`

```ts
import { request } from 'undici';
import { config } from './config';

export async function openaiResponsesRequest(body: unknown) {
  const url = `${config.openai.baseUrl}/v1/responses`;

  const res = await request(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openai.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    headersTimeout: config.openai.timeoutMs,
    bodyTimeout: config.openai.timeoutMs,
  });

  return res;
}

export async function openaiResponsesStream(body: unknown) {
  const url = `${config.openai.baseUrl}/v1/responses`;

  const res = await request(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openai.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    headersTimeout: config.openai.streamTimeoutMs,
    bodyTimeout: config.openai.streamTimeoutMs,
  });

  return res;
}
```

---

### 7.11. `apps/ai-relay/src/sse.ts`

```ts
import type { FastifyReply } from 'fastify';
import type { StreamEvent } from './types';

export function proxySse(reply: FastifyReply, ev: StreamEvent): void {
  reply.raw.write(ev.data);
}
```

---

### 7.12. `apps/ai-relay/src/utils.ts`

```ts
const DIAGNOSTIC_HEADERS = [
  'x-request-id',
  'openai-request-id',
  'x-ratelimit-limit-requests',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-reset-requests',
  'x-ratelimit-limit-tokens',
  'x-ratelimit-remaining-tokens',
  'x-ratelimit-reset-tokens',
];

export async function readBodyBuffer(
  body: AsyncIterable<Uint8Array> | null
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function extractDiagnosticHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of DIAGNOSTIC_HEADERS) {
    const value = headers[key];
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}
```
```

---

### 7.13. `apps/ai-relay/src/server.ts`

```ts
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { config } from './config';
import { verifyRelaySignature } from './auth';
import { openaiResponsesRequest, openaiResponsesStream } from './openai';
import { proxySse } from './sse';
import type { RelayPurpose } from './types';
import { extractDiagnosticHeaders, readBodyBuffer } from './utils';

export function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.relay.maxBodyBytes,
  });

  // Парсим JSON как Buffer, чтобы сохранить raw body для подписи.
  app.addContentTypeParser(
    /^application\/json(?:;|$)/,
    { parseAs: 'buffer' },
    (req, body, done) => {
      const buffer = body as Buffer;
      req.rawBody = buffer;
      if (buffer.length === 0) {
        done(null, {});
        return;
      }
      try {
        const json = JSON.parse(buffer.toString('utf-8'));
        done(null, json);
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        error.statusCode = 400;
        done(error);
      }
    }
  );

  app.get('/health', async () => ({ ok: true }));

  app.post('/v1/responses', async (req, reply) => {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw Object.assign(new Error('Raw body is required'), {
        statusCode: 400,
      });
    }

    verifyRelaySignature({
      req,
      rawBody,
      method: 'POST',
      path: '/v1/responses',
    });

    const purpose = (req.headers['x-purpose'] as string) || 'other';
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const parsedBody = (req.body || {}) as Record<string, unknown>;
    const isStream = Boolean(parsedBody?.stream);

    const t0 = Date.now();
    const res = isStream
      ? await openaiResponsesStream(parsedBody)
      : await openaiResponsesRequest(parsedBody);

    const diagnosticHeaders = extractDiagnosticHeaders(res.headers);

    if (!isStream) {
      const bodyBuffer = await readBodyBuffer(res.body as any);
      const dt = Date.now() - t0;

      app.log.info(
        {
          purpose: purpose as RelayPurpose,
          requestId,
          status: res.statusCode,
          ms: dt,
          bodyBytes: rawBody.length,
        },
        'relay_responses_request'
      );

      reply.code(res.statusCode);
      reply.header('X-Relay-Request-Id', requestId);
      for (const [key, value] of Object.entries(diagnosticHeaders)) {
        reply.header(key, value);
      }
      reply.header(
        'content-type',
        res.headers['content-type'] || 'application/json'
      );
      return reply.send(bodyBuffer);
    }

    const contentTypeHeader = res.headers['content-type'];
    const contentType = Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : contentTypeHeader;

    reply.raw.statusCode = res.statusCode;
    reply.raw.setHeader(
      'content-type',
      contentType || 'text/event-stream; charset=utf-8'
    );
    reply.raw.setHeader('cache-control', 'no-cache');
    reply.raw.setHeader('connection', 'keep-alive');
    reply.raw.setHeader('x-relay-request-id', requestId);
    for (const [key, value] of Object.entries(diagnosticHeaders)) {
      reply.raw.setHeader(key, value);
    }

    if (res.statusCode >= 400) {
      const errorBuffer = await readBodyBuffer(res.body as any);
      reply.raw.end(errorBuffer);

      const dt = Date.now() - t0;
      app.log.info(
        {
          purpose: purpose as RelayPurpose,
          requestId,
          status: res.statusCode,
          ms: dt,
        },
        'relay_responses_stream_error'
      );
      return;
    }

    try {
      for await (const chunk of res.body as any) {
        proxySse(reply, {
          type: 'raw',
          data: Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
        });
      }
    } finally {
      reply.raw.end();
      const dt = Date.now() - t0;
      app.log.info(
        {
          purpose: purpose as RelayPurpose,
          requestId,
          status: res.statusCode,
          ms: dt,
        },
        'relay_responses_stream'
      );
    }
  });

  return app;
}
```

---

### 7.14. `apps/ai-relay/src/index.ts` `apps/ai-relay/src/index.ts`

```ts
import { config } from './config';
import { buildServer } from './server';

const app = buildServer();

app.listen({ port: config.port, host: '0.0.0.0' }).then((address) => {
  app.log.info({ address }, 'ai-relay started');
});
```

---

## 8) Что нужно поменять в твоем основном проекте (критично коротко)

1. Включить relay в `server/infrastructure/llm/relayClient`:

- baseUrl на Hetzner
- отправка `X-Relay-*` заголовков
- подпись по телу и пути

2. `OPENAI_REQUESTS_DISABLED`

- **оставляем `true` как сейчас**, по решению владельца проекта
- важно: при текущей реализации `OPENAI_REQUESTS_DISABLED = true` блокирует **все** вызовы (включая Relay), и это **сейчас ожидаемое поведение** до переключения флага

---

## 9) Как запускать локально

Внутри `apps/ai-relay`:

```bash
cp .env.example .env
# вставь OPENAI_API_KEY и RELAY_SHARED_SECRET
npm install
npm run dev
```

Проверка:

- `GET http://localhost:8080/health`
