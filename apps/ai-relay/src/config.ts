export function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing env: ${name}`);
  }
  return String(value);
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
    // Обмен SDP для realtime укладывается в секунды — короткий лимит ловит зависшие соединения.
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),
    // Ответ без стрима приходит целиком в самом конце, поэтому лимит здесь равен
    // всему времени генерации. У reasoning-моделей на длинном диалоге это минуты,
    // и общие 30 с рвали связь до того, как OpenAI успевал ответить.
    responsesTimeoutMs: Number(
      process.env.OPENAI_RESPONSES_TIMEOUT_MS || 150000
    ),
    streamTimeoutMs: Number(process.env.OPENAI_STREAM_TIMEOUT_MS || 120000),
  },

  relay: {
    sharedSecret: mustGetEnv('RELAY_SHARED_SECRET'),
    maxBodyBytes: Number(process.env.RELAY_MAX_BODY_BYTES || 1048576),
    signatureTtlMs: Number(process.env.RELAY_SIGNATURE_TTL_MS || 60000),
  },
};
