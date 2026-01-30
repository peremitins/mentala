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
