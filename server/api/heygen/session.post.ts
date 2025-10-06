import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody<{
    avatarId?: string;
    voiceId?: string;
    quality?: 'high' | 'medium' | 'low';
    video_encoding?: 'H264' | 'VP8';
    knowledge_base?: string;
    version?: 'v2' | string;
    stt_settings?: { provider?: string; confidence?: number };
    disable_idle_timeout?: boolean;
    activity_idle_timeout?: number;
  }>(event);

  const url = `${config.heygenBaseUrl}/v1/streaming.new`;

  const res = await $fetch(url, {
    method: 'POST',
    headers: {
      'X-Api-Key': String(config.heygenApiKey || ''),
      'Content-Type': 'application/json',
    },
    body: {
      avatar_id: body.avatarId || config.heygenAvatarId || undefined,
      quality: body.quality ?? 'low', // high, medium, low
      video_encoding: body.video_encoding ?? 'VP8',
      // knowledge_base: body.knowledge_base || undefined,
      version: body.version ?? 'v2',
      // stt_settings: body.stt_settings ?? {
      //   provider: 'deepgram',
      //   confidence: 0.55,
      // },
      disable_idle_timeout: body.disable_idle_timeout ?? false,
      activity_idle_timeout: body.activity_idle_timeout ?? 20,
      // voice: body.voiceId ? { voice_id: body.voiceId } : undefined,
    },
  });

  if (!res || !(res as any).data?.access_token || !(res as any).data?.url) {
    throw createError({
      statusCode: 502,
      statusMessage: 'HeyGen new session failed',
    });
  }

  return res;
});
