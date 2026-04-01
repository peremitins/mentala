import { Capacitor, registerPlugin } from '@capacitor/core';

type MentalaRealtimeVoiceAudioPlugin = {
  activate(): Promise<{
    mode?: string;
    volumeStream?: string;
  }>;
  deactivate(): Promise<void>;
};

const MentalaRealtimeVoiceAudio =
  registerPlugin<MentalaRealtimeVoiceAudioPlugin>(
    'MentalaRealtimeVoiceAudio'
  );

function shouldAttemptRealtimeVoiceNativeAudioBridge() {
  if (typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== 'android') return false;

  // Локальные Android plugins, которые регистрируются через MainActivity,
  // не обязаны попадать в Capacitor PluginHeaders.
  // Поэтому isPluginAvailable() здесь даёт ложный false и блокирует
  // реальный вызов bridge. Для realtime voice просто пробуем нативный вызов
  // и считаем недоступность по факту reject/error.
  return true;
}

export async function activateRealtimeVoiceNativeAudioSession() {
  if (!shouldAttemptRealtimeVoiceNativeAudioBridge()) {
    return false;
  }

  try {
    const result = await MentalaRealtimeVoiceAudio.activate();
    console.info(
      '[RealtimeVoiceNativeAudio] Android communication speaker route activated:',
      {
        mode: result?.mode || 'unknown',
        volumeStream: result?.volumeStream || 'unknown',
      }
    );
    return true;
  } catch (error) {
    console.error(
      '[RealtimeVoiceNativeAudio] Failed to activate Android communication speaker route:',
      error
    );
    return false;
  }
}

export async function deactivateRealtimeVoiceNativeAudioSession() {
  if (!shouldAttemptRealtimeVoiceNativeAudioBridge()) {
    return;
  }

  try {
    await MentalaRealtimeVoiceAudio.deactivate();
  } catch (error) {
    console.error(
      '[RealtimeVoiceNativeAudio] Failed to restore Android realtime audio state:',
      error
    );
  }
}
