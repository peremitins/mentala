import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from './config.js';

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
  ].join('\n');
  const expected = hmacBase64(config.relay.sharedSecret, canonical);

  if (!safeEqualBase64(sig, expected)) {
    throw Object.assign(new Error('Invalid relay signature'), {
      statusCode: 401,
    });
  }

  rememberNonce(nonce, now);
}
