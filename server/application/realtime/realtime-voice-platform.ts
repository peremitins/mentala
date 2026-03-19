import { getHeader } from 'h3';
import type { RealtimeVoiceClientPlatform } from '@/shared/dto';

export function normalizeRealtimeVoicePlatform(
  value?: string | null
): RealtimeVoiceClientPlatform {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (normalized === 'ios' || normalized === 'android' || normalized === 'web') {
    return normalized;
  }

  return 'web';
}

export function resolveRealtimeVoicePlatform(event: Parameters<typeof getHeader>[0], hint?: string | null) {
  const headerPlatform = normalizeRealtimeVoicePlatform(
    String(getHeader(event, 'x-platform') || '')
  );

  if (headerPlatform !== 'web') {
    return headerPlatform;
  }

  return normalizeRealtimeVoicePlatform(hint);
}
