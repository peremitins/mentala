import { $fetch } from 'ofetch';
import { createError } from 'h3';
import { isRelayEnabled, relayResponsesRequest } from './relayClient';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export async function sendOpenAiResponsesRequest(params: {
  body: any;
  purpose:
    | 'chat'
    | 'chat_stream'
    | 'chips'
    | 'finish_session'
    | 'notification'
    | 'other';
  timeoutMs?: number;
  apiKey?: string;
  org?: string | null;
  project?: string | null;
  idempotencyKey?: string;
  requestId?: string;
}) {
  if (isRelayEnabled()) {
    return await relayResponsesRequest({
      path: '/v1/responses',
      body: params.body,
      purpose: params.purpose,
      timeoutMs: params.timeoutMs,
      requestId: params.requestId,
    });
  }

  if (!params.apiKey) {
    throw createError({
      statusCode: 500,
      message: 'NUXT_OPENAI_API_KEY is not set',
    });
  }

  return await $fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    timeout: params.timeoutMs,
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      ...(params.org ? { 'OpenAI-Organization': params.org } : {}),
      ...(params.project ? { 'OpenAI-Project': params.project } : {}),
      ...(params.idempotencyKey
        ? { 'Idempotency-Key': params.idempotencyKey }
        : {}),
    },
    body: params.body,
  });
}

export function extractResponsesText(res: any): string {
  return res?.output_text || res?.output?.[0]?.content?.[0]?.text || '';
}

export function parseStrictJsonResponse(raw: string): any {
  const trimmed = String(raw || '').trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : trimmed).trim();

  return JSON.parse(body);
}
