import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { verifyRelaySignature } from './auth.js';
import {
  openaiRealtimeCall,
  openaiResponsesRequest,
  openaiResponsesStream,
} from './openai.js';
import { proxySse } from './sse.js';
import type { RelayPurpose, RelayRealtimeCallBody } from './types.js';
import { extractDiagnosticHeaders, readBodyBuffer } from './utils.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseRealtimeCallBody(body: unknown): RelayRealtimeCallBody {
  if (!isRecord(body)) {
    throw Object.assign(
      new Error('Realtime relay body must be a JSON object'),
      {
        statusCode: 400,
      }
    );
  }

  const rawSdp = body.sdp;
  const sdp = typeof rawSdp === 'string' ? rawSdp : '';
  if (!sdp.trim()) {
    throw Object.assign(new Error('Realtime SDP offer is required'), {
      statusCode: 400,
    });
  }

  const rawSession = body.session;
  if (
    rawSession !== undefined &&
    rawSession !== null &&
    !isRecord(rawSession)
  ) {
    throw Object.assign(
      new Error('Realtime session config must be an object or null'),
      {
        statusCode: 400,
      }
    );
  }

  const rawClientSecret = body.clientSecret;
  if (
    rawClientSecret !== undefined &&
    rawClientSecret !== null &&
    typeof rawClientSecret !== 'string'
  ) {
    throw Object.assign(new Error('Realtime clientSecret must be a string'), {
      statusCode: 400,
    });
  }

  return {
    sdp,
    session: isRecord(rawSession) ? rawSession : null,
    clientSecret:
      typeof rawClientSecret === 'string' && rawClientSecret.trim().length > 0
        ? rawClientSecret.trim()
        : null,
  };
}

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.relay.maxBodyBytes,
    // Таймауты для клиентских соединений, чтобы не висели залипшие коннекты.
    requestTimeout: config.openai.streamTimeoutMs + 10_000,
    keepAliveTimeout: 75_000,
    connectionTimeout: 30_000,
  });

  // Подключаем raw-body до объявления маршрутов, чтобы Fastify корректно сохранил байты запроса.
  await app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: false,
    runFirst: true,
    routes: ['/v1/responses', '/v1/realtime/calls'],
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/v1/responses', async (req, reply) => {
    // В типах Fastify нет rawBody, поэтому приводим явно.
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
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
    reply.raw.setHeader('X-Relay-Request-Id', requestId);
    // Выключаем буферизацию у прокси (Nginx/Cloudflare), чтобы SSE не шёл пачками.
    reply.raw.setHeader('x-accel-buffering', 'no');
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

  app.post('/v1/realtime/calls', async (req, reply) => {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw Object.assign(new Error('Raw body is required'), {
        statusCode: 400,
      });
    }

    verifyRelaySignature({
      req,
      rawBody,
      method: 'POST',
      path: '/v1/realtime/calls',
    });

    const purpose = (req.headers['x-purpose'] as string) || 'realtime_call';
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const parsedBody = parseRealtimeCallBody(req.body);
    const t0 = Date.now();

    try {
      const result = await openaiRealtimeCall(parsedBody);
      const dt = Date.now() - t0;
      const openaiRequestId =
        result.headers.get('openai-request-id') ||
        result.headers.get('x-request-id');

      app.log.info(
        {
          purpose: purpose as RelayPurpose,
          requestId,
          status: result.statusCode,
          ms: dt,
          hasSessionConfig: Boolean(parsedBody.session),
        },
        'relay_realtime_call'
      );

      reply.code(result.statusCode);
      reply.header('X-Relay-Request-Id', requestId);
      if (openaiRequestId) {
        reply.header('openai-request-id', openaiRequestId);
      }
      reply.header('content-type', 'application/sdp');
      return reply.send(result.answerSdp);
    } catch (error: any) {
      const dt = Date.now() - t0;
      const statusCode = Number(error?.statusCode || 502);
      const errorMessage = String(
        error?.message || 'Realtime relay request failed'
      );
      const openaiRequestId = String(
        error?.diagnosticHeaders?.openaiRequestId || ''
      ).trim();

      app.log.warn(
        {
          purpose: purpose as RelayPurpose,
          requestId,
          status: statusCode,
          ms: dt,
          hasSessionConfig: Boolean(parsedBody.session),
          message: errorMessage,
        },
        'relay_realtime_call_error'
      );

      reply.code(statusCode);
      reply.header('X-Relay-Request-Id', requestId);
      if (openaiRequestId) {
        reply.header('openai-request-id', openaiRequestId);
      }

      return reply.send({
        message: errorMessage,
      });
    }
  });

  return app;
}
