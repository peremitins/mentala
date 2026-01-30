import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { verifyRelaySignature } from './auth.js';
import { openaiResponsesRequest, openaiResponsesStream } from './openai.js';
import { proxySse } from './sse.js';
import type { RelayPurpose } from './types.js';
import { extractDiagnosticHeaders, readBodyBuffer } from './utils.js';

export function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.relay.maxBodyBytes,
    // Таймауты для клиентских соединений, чтобы не висели залипшие коннекты.
    requestTimeout: config.openai.streamTimeoutMs + 10_000,
    keepAliveTimeout: 75_000,
    connectionTimeout: 30_000,
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

  return app;
}
