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

  if (params.platform !== 'web') {
    // На mobile полностью отключаем client-side interrupt:
    // ложные speech-start от шорохов и собственного playback дают
    // слишком много лишних response.cancel.
    return false;
  }

  return true;
}

export function shouldSuppressRealtimeInputDuringAssistantPlayback(params: {
  platform: Platform;
  isAssistantAudioPlaying: boolean;
  isKnownUserInputItem?: boolean;
}) {
  if (params.isKnownUserInputItem) {
    return false;
  }

  return params.platform === 'ios' && params.isAssistantAudioPlaying;
}
