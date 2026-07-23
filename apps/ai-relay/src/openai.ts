import { request } from 'undici';
import { config } from './config.js';
import type { RelayRealtimeCallBody } from './types.js';

const OPENAI_REALTIME_CALLS_PATH = '/v1/realtime/calls';

function getOpenAiProviderHeaders(extra?: HeadersInit): HeadersInit {
  return {
    authorization: `Bearer ${config.openai.apiKey}`,
    ...(extra || {}),
  };
}

export async function openaiResponsesRequest(body: unknown) {
  const url = `${config.openai.baseUrl}/v1/responses`;

  const res = await request(url, {
    method: 'POST',
    headers: getOpenAiProviderHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
    headersTimeout: config.openai.responsesTimeoutMs,
    bodyTimeout: config.openai.responsesTimeoutMs,
  });

  return res;
}

export async function openaiResponsesStream(body: unknown) {
  const url = `${config.openai.baseUrl}/v1/responses`;

  const res = await request(url, {
    method: 'POST',
    headers: getOpenAiProviderHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
    headersTimeout: config.openai.streamTimeoutMs,
    bodyTimeout: config.openai.streamTimeoutMs,
  });

  return res;
}

export async function openaiRealtimeCall(body: RelayRealtimeCallBody) {
  const url = `${config.openai.baseUrl}${OPENAI_REALTIME_CALLS_PATH}`;
  const normalizedSdp = String(body.sdp || '');
  if (!normalizedSdp.trim()) {
    throw Object.assign(new Error('Realtime SDP offer is required'), {
      statusCode: 400,
    });
  }

  const hasSessionConfig =
    body.session &&
    typeof body.session === 'object' &&
    !Array.isArray(body.session);

  const normalizedClientSecret = String(body.clientSecret || '').trim();

  const requestInit: RequestInit = hasSessionConfig
    ? {
        method: 'POST',
        headers: getOpenAiProviderHeaders(),
        body: (() => {
          const formData = new FormData();
          // Важно передавать SDP как есть: OpenAI чувствителен к завершающим CRLF.
          formData.set('sdp', normalizedSdp);
          formData.set('session', JSON.stringify(body.session));
          return formData;
        })(),
        signal: AbortSignal.timeout(config.openai.timeoutMs),
      }
    : {
        method: 'POST',
        headers: {
          authorization: `Bearer ${normalizedClientSecret}`,
          'content-type': 'application/sdp',
        },
        body: normalizedSdp,
        signal: AbortSignal.timeout(config.openai.timeoutMs),
      };

  if (!hasSessionConfig && !normalizedClientSecret) {
    throw Object.assign(
      new Error('Realtime provider credentials are required'),
      {
        statusCode: 400,
      }
    );
  }

  const response = await fetch(url, requestInit);
  const answerSdp = await response.text();

  if (!response.ok) {
    throw Object.assign(
      new Error(
        answerSdp.trim().length > 0
          ? `OpenAI realtime call failed: ${response.status} ${answerSdp}`
          : `OpenAI realtime call failed: ${response.status}`
      ),
      {
        statusCode: response.status,
        diagnosticHeaders: {
          openaiRequestId:
            response.headers.get('openai-request-id') ||
            response.headers.get('x-request-id') ||
            '',
        },
      }
    );
  }

  if (!answerSdp.trim()) {
    throw Object.assign(
      new Error('OpenAI realtime call returned empty SDP answer'),
      {
        statusCode: 502,
      }
    );
  }

  return {
    statusCode: response.status,
    answerSdp,
    headers: response.headers,
  };
}
