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
      // latency — нестандартное, но поддерживаемое поле WebRTC на Android/iOS
      // @ts-ignore
      latency: {
        ideal: 0,
      },
    } as MediaTrackConstraints;
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

  // mobile (iOS + Android) глушит half-duplex: пока ассистент говорит, любой
  // «новый» input-item — это почти наверняка эхо собственного playback, а не
  // реплика пользователя. На web сохраняем full duplex с barge-in.
  const isMobile = params.platform === 'ios' || params.platform === 'android';
  return isMobile && params.isAssistantAudioPlaying;
}
