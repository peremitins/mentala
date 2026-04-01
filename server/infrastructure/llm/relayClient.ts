import { createHash, createHmac, randomUUID } from 'node:crypto';
import { $fetch } from 'ofetch';
import { createError } from 'h3';

type RelayPurpose =
  | 'chat'
  | 'chat_stream'
  | 'chips'
  | 'finish_session'
  | 'notification'
  | 'realtime_call'
  | 'other';

type RelayRequestParams = {
  path: string;
  body?: unknown;
  purpose: RelayPurpose;
  timeoutMs?: number;
  requestId?: string;
};

type RelayStreamResult = {
  stream: AsyncIterable<string>;
  responseIdPromise: Promise<string | undefined>;
  completionPromise: Promise<{
    responseId?: string;
    response?: Record<string, unknown> | null;
  }>;
};

const RELAY_DEFAULT_TIMEOUT_MS = 60_000;

function isTruthy(value?: string | null) {
  return Boolean(value && value.trim().length > 0);
}

export function isRelayEnabled() {
  const explicit = process.env.AI_USE_RELAY;
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return isTruthy(process.env.AI_RELAY_URL);
}

function requireRelayEnv() {
  const relayUrl = process.env.AI_RELAY_URL;
  const relaySecret = process.env.AI_RELAY_AUTH_SECRET;
  const relayClientId = process.env.AI_RELAY_CLIENT_ID;

  if (!isTruthy(relayUrl)) {
    throw createError({
      statusCode: 500,
      message: 'AI_RELAY_URL is not set',
    });
  }
  if (!isTruthy(relaySecret)) {
    throw createError({
      statusCode: 500,
      message: 'AI_RELAY_AUTH_SECRET is not set',
    });
  }
  if (!isTruthy(relayClientId)) {
    throw createError({
      statusCode: 500,
      message: 'AI_RELAY_CLIENT_ID is not set',
    });
  }

  return {
    relayUrl: relayUrl!,
    relaySecret: relaySecret!,
    relayClientId: relayClientId!,
  };
}

function sha256Hex(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

function signRequest(params: {
  method: string;
  path: string;
  rawBody: string;
  purpose: RelayPurpose;
  requestId?: string;
}) {
  // Подписываем запрос HMAC по канонической строке, как описано в ТЗ.
  const { relaySecret, relayClientId } = requireRelayEnv();
  const requestId = params.requestId || randomUUID();
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const bodyHash = sha256Hex(params.rawBody || '');
  const canonical = [
    params.method.toUpperCase(),
    params.path,
    timestamp,
    nonce,
    bodyHash,
    relayClientId,
  ].join('\n');
  const signature = createHmac('sha256', relaySecret)
    .update(canonical)
    .digest('base64');

  return {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Relay-Client': relayClientId,
      'X-Relay-Timestamp': timestamp,
      'X-Relay-Nonce': nonce,
      'X-Relay-Signature': signature,
      'X-Purpose': params.purpose,
      'X-Request-Id': requestId,
    },
    requestId,
  };
}

function buildRelayRequest(params: RelayRequestParams) {
  const { relayUrl } = requireRelayEnv();
  const rawBody = JSON.stringify(params.body ?? {});
  const { headers } = signRequest({
    method: 'POST',
    path: params.path,
    rawBody,
    purpose: params.purpose,
    requestId: params.requestId,
  });

  return {
    relayUrl,
    rawBody,
    headers,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeRelayError(err: unknown, fallbackMessage: string): never {
  const errorRecord = isRecord(err) ? err : {};
  const responseRecord = isRecord(errorRecord.response)
    ? errorRecord.response
    : {};
  const responseData = responseRecord._data;
  const errorDataSource =
    errorRecord.data !== undefined ? errorRecord.data : responseData;
  const dataRecord = isRecord(errorDataSource) ? errorDataSource : {};
  const dataText =
    typeof errorDataSource === 'string' ? errorDataSource : undefined;
  const errorData = isRecord(dataRecord.error) ? dataRecord.error : {};
  const status =
    (responseRecord.status as number | undefined) ||
    (errorRecord.status as number | undefined) ||
    (errorRecord.statusCode as number | undefined) ||
    500;
  const message =
    getString(errorData.message) ||
    getString(dataRecord.message) ||
    dataText ||
    getString(errorRecord.message);
  throw createError({
    statusCode: status,
    message: message || fallbackMessage,
  });
}

export async function relayResponsesRequest<T = any>(
  params: RelayRequestParams
): Promise<T> {
  const { relayUrl, rawBody, headers } = buildRelayRequest(params);

  try {
    return await $fetch<T>(`${relayUrl}${params.path}`, {
      method: 'POST',
      headers,
      timeout: params.timeoutMs ?? RELAY_DEFAULT_TIMEOUT_MS,
      body: rawBody,
    });
  } catch (err: unknown) {
    normalizeRelayError(err, 'Relay request failed');
  }
}

export async function relayRealtimeCall(params: {
  sdp: string;
  session?: Record<string, unknown> | null;
  clientSecret?: string | null;
  timeoutMs?: number;
  requestId?: string;
}) {
  const { relayUrl, rawBody, headers } = buildRelayRequest({
    path: '/v1/realtime/calls',
    body: {
      sdp: params.sdp,
      session: params.session ?? null,
      clientSecret: params.clientSecret ?? null,
    },
    purpose: 'realtime_call',
    timeoutMs: params.timeoutMs,
    requestId: params.requestId,
  });

  try {
    return await $fetch<string>(`${relayUrl}/v1/realtime/calls`, {
      method: 'POST',
      headers,
      timeout: params.timeoutMs ?? RELAY_DEFAULT_TIMEOUT_MS,
      responseType: 'text',
      body: rawBody,
    });
  } catch (err: unknown) {
    normalizeRelayError(err, 'Relay realtime call failed');
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function toAsyncIterable(source: unknown): AsyncIterable<Buffer | string> {
  if (
    source &&
    typeof (source as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  ) {
    return source as AsyncIterable<Buffer | string>;
  }

  const reader = (
    source as ReadableStream<Uint8Array> | undefined
  )?.getReader?.();
  if (reader) {
    return (async function* () {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          yield Buffer.from(value);
        }
      }
    })();
  }

  throw createError({
    statusCode: 500,
    message: 'Relay stream is not async iterable',
  });
}

async function* iterateSseData(
  stream: AsyncIterable<Buffer | string>
): AsyncIterable<string> {
  // Простой SSE-парсер: собираем чанки и разбиваем по пустой строке.
  let buffer = '';
  const decoder = new TextDecoder('utf-8');
  for await (const chunk of stream) {
    // Используем TextDecoder, чтобы корректно обрабатывать UTF-8 на границах чанков.
    const chunkText =
      typeof chunk === 'string'
        ? chunk
        : decoder.decode(chunk, { stream: true });
    buffer += chunkText;
    buffer = buffer.replace(/\r\n/g, '\n');

    while (true) {
      const idx = buffer.indexOf('\n\n');
      if (idx === -1) break;
      const rawEvent = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);

      if (!rawEvent) continue;

      const lines = rawEvent.split('\n');
      const dataLines = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''));
      if (!dataLines.length) continue;

      yield dataLines.join('\n');
    }
  }

  buffer += decoder.decode();
  const rest = buffer.trim();
  if (rest) {
    const lines = rest.split('\n');
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''));
    if (dataLines.length) {
      yield dataLines.join('\n');
    }
  }
}

export async function relayResponsesStream(
  params: RelayRequestParams
): Promise<RelayStreamResult> {
  const { relayUrl, rawBody, headers } = buildRelayRequest(params);

  try {
    const resp = await $fetch.raw(`${relayUrl}${params.path}`, {
      method: 'POST',
      headers,
      responseType: 'stream' as const,
      timeout: params.timeoutMs ?? RELAY_DEFAULT_TIMEOUT_MS,
      body: rawBody,
    });

    const stream = toAsyncIterable(resp._data);
    const responseIdDeferred = createDeferred<string | undefined>();
    const completionDeferred = createDeferred<{
      responseId?: string;
      response?: Record<string, unknown> | null;
    }>();

    const deltaStream = (async function* () {
      let responseId: string | undefined;
      let candidateResponseId: string | undefined;
      let completedResponse: Record<string, unknown> | null = null;
      try {
        for await (const data of iterateSseData(stream)) {
          if (data === '[DONE]') break;

          let event: unknown;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          if (!isRecord(event)) {
            continue;
          }

          const eventType = getString(event.type);
          const delta = getString(event.delta);
          const responseIdFromEvent = getString(event.response_id);
          const responseObj = isRecord(event.response) ? event.response : {};
          const responseIdFromResponse = getString(responseObj.id);
          const errorObj = isRecord(event.error) ? event.error : {};
          const errorMessage = getString(errorObj.message);

          if (
            eventType === 'response.output_text.delta' &&
            typeof delta === 'string'
          ) {
            if (typeof responseIdFromEvent === 'string') {
              candidateResponseId = responseIdFromEvent;
            }
            yield delta;
          }

          if (
            eventType === 'response.completed' ||
            eventType === 'response.done'
          ) {
            responseId =
              responseIdFromResponse || candidateResponseId || responseId;
            if (Object.keys(responseObj).length > 0) {
              completedResponse = responseObj;
            }
          }

          if (eventType === 'error' || eventType === 'response.error') {
            throw createError({
              statusCode: 500,
              message: errorMessage || 'Relay stream error',
            });
          }
        }
        if (!responseId && candidateResponseId) {
          responseId = candidateResponseId;
        }
      } finally {
        responseIdDeferred.resolve(responseId);
        completionDeferred.resolve({
          responseId,
          response: completedResponse,
        });
      }
    })();

    return {
      stream: deltaStream,
      responseIdPromise: responseIdDeferred.promise,
      completionPromise: completionDeferred.promise,
    };
  } catch (err: unknown) {
    normalizeRelayError(err, 'Relay stream failed');
  }
}
