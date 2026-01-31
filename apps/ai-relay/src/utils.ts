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
