import type { Platform } from '@/app/composables/usePlatform';

export function buildRealtimeVoiceAudioConstraints(
  platform: Platform
): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = {
    channelCount: {
      ideal: 1,
    },
    echoCancellation: {
      ideal: true,
    },
    noiseSuppression: {
      ideal: true,
    },
    autoGainControl: {
      ideal: true,
    },
  };

  if (platform === 'android' || platform === 'ios') {
    return {
      ...baseConstraints,
      // На mobile WebView стараемся держать mono-вход с минимальной latency,
      // чтобы уменьшить акустическую петлю "динамик -> микрофон".
      latency: {
        ideal: 0,
      },
    };
  }

  return baseConstraints;
}

export function shouldInterruptRealtimeAssistantOnSpeechStart(params: {
  platform: Platform;
  activeResponseId: string | null;
  wasAlreadyInterrupted: boolean;
  isAssistantAudioPlaying: boolean;
}): boolean {
  if (!params.activeResponseId || params.wasAlreadyInterrupted) {
    return false;
  }

  if (params.platform === 'web') {
    return true;
  }

  // На mobile не прерываем ассистента, пока реально играет его звук:
  // Android/iOS WebView часто ловят свой же playback как новый speech-start.
  return !params.isAssistantAudioPlaying;
}
