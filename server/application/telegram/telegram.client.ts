import { request } from 'node:https';
import { getTelegramAlertsConfig } from './telegram-alerts.config';

export class TelegramApiError extends Error {
  statusCode: number | null;
  retryAfterSeconds: number | null;
  responseBody: unknown;
  transportCode: string | null;

  constructor(params: {
    message: string;
    statusCode?: number | null;
    retryAfterSeconds?: number | null;
    responseBody?: unknown;
    transportCode?: string | null;
  }) {
    super(params.message);
    this.name = 'TelegramApiError';
    this.statusCode = params.statusCode ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
    this.responseBody = params.responseBody ?? null;
    this.transportCode = params.transportCode ?? null;
  }
}

export function isRetryableTelegramTransportError(
  error: TelegramApiError
): boolean {
  if (error.statusCode === 429) {
    return true;
  }

  return [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNABORTED',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ECONNREFUSED',
  ].includes(
    String(error.transportCode || '')
      .trim()
      .toUpperCase()
  );
}

export function isAmbiguousTelegramDeliveryError(
  error: TelegramApiError
): boolean {
  return (
    String(error.transportCode || '')
      .trim()
      .toUpperCase() === 'TIMEOUT'
  );
}

export async function sendTelegramMessage(params: { text: string }): Promise<{
  telegramMessageId: string | null;
  providerResponseCode: number | null;
}> {
  const config = getTelegramAlertsConfig();
  if (!config.botToken || !config.chatId) {
    throw new TelegramApiError({
      message: 'Telegram alerts bot is not configured',
    });
  }

  const requestBody = new URLSearchParams({
    chat_id: config.chatId,
    text: params.text,
    disable_web_page_preview: 'true',
  }).toString();

  // api.telegram.org по умолчанию, либо хост прокси (Cloudflare Worker),
  // если Telegram заблокирован на сервере (РФ).
  const apiHost = config.apiBaseHost;
  const isDirectTelegramHost = apiHost === 'api.telegram.org';

  try {
    const response = await new Promise<{
      statusCode: number | null;
      rawBody: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: apiHost,
          // Форсируем IPv4 только для прямого api.telegram.org: в текущей среде
          // Node TLS до Telegram по дефолтному резолву рвётся до handshake.
          // Для прокси (Cloudflare и пр.) пусть резолвер выбирает сам.
          ...(isDirectTelegramHost ? { family: 4 as const } : {}),
          path: `/bot${config.botToken}/sendMessage`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(requestBody),
          },
          timeout: config.apiTimeoutMs,
        },
        (res) => {
          let rawBody = '';

          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            rawBody += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? null,
              rawBody,
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(
          new Error(
            `Telegram sendMessage timed out after ${config.apiTimeoutMs}ms`
          )
        );
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(requestBody);
      req.end();
    });

    let parsedBody: any = null;

    try {
      parsedBody = response.rawBody ? JSON.parse(response.rawBody) : null;
    } catch {
      parsedBody = response.rawBody;
    }

    if (
      !response.statusCode ||
      response.statusCode < 200 ||
      response.statusCode >= 300 ||
      parsedBody?.ok === false
    ) {
      const retryAfterSeconds = Number(
        parsedBody?.parameters?.retry_after ?? 0
      );

      throw new TelegramApiError({
        message: `Telegram sendMessage failed with status ${response.statusCode ?? 'unknown'}`,
        statusCode: response.statusCode,
        retryAfterSeconds:
          retryAfterSeconds > 0 ? Math.round(retryAfterSeconds) : null,
        responseBody: parsedBody,
      });
    }

    return {
      telegramMessageId: parsedBody?.result?.message_id
        ? String(parsedBody.result.message_id)
        : null,
      providerResponseCode: response.statusCode,
    };
  } catch (error: any) {
    if (
      typeof error?.message === 'string' &&
      error.message.includes('timed out')
    ) {
      throw new TelegramApiError({
        message: `Telegram sendMessage timed out after ${config.apiTimeoutMs}ms`,
        transportCode: 'TIMEOUT',
      });
    }

    if (error instanceof TelegramApiError) {
      throw error;
    }

    const errorCode = String(error?.code || error?.cause?.code || '').trim();

    throw new TelegramApiError({
      message: errorCode
        ? `Telegram transport error: ${errorCode} ${error?.message || ''}`.trim()
        : error?.message || 'Unknown Telegram API error',
      responseBody: error,
      transportCode: errorCode || null,
    });
  }
}
