import { Capacitor, registerPlugin } from '@capacitor/core';

type MentalaRealtimeVoiceAudioPlugin = {
  activate(): Promise<{
    platform?: string;
    category?: string;
    mode?: string;
    volumeStream?: string;
    speakerPinned?: boolean;
    // Android: фактически выбранный communication device для realtime voice
    // (bluetooth_sco, ble_headset, wired_headset, builtin_speaker и т.д.).
    // Полезно для диагностики проблем с роутингом по логам.
    route?: string;
  }>;
  deactivate(): Promise<void>;
};

const MentalaRealtimeVoiceAudio =
  registerPlugin<MentalaRealtimeVoiceAudioPlugin>('MentalaRealtimeVoiceAudio');

function shouldAttemptRealtimeVoiceNativeAudioBridge() {
  if (typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return false;

  // Локальные Android plugins, которые регистрируются через MainActivity,
  // и iOS plugins из MainViewController не обязаны попадать в Capacitor
  // PluginHeaders. Поэтому isPluginAvailable() здесь может дать ложный false:
  // для realtime voice пробуем вызов и считаем недоступность по факту reject.
  return true;
}

export async function activateRealtimeVoiceNativeAudioSession() {
  if (!shouldAttemptRealtimeVoiceNativeAudioBridge()) {
    return false;
  }

  try {
    const result = await MentalaRealtimeVoiceAudio.activate();
    console.info(
      '[RealtimeVoiceNativeAudio] Native realtime audio session activated:',
      {
        platform: result?.platform || Capacitor.getPlatform(),
        category: result?.category || 'unknown',
        mode: result?.mode || 'unknown',
        volumeStream: result?.volumeStream || 'unknown',
        speakerPinned: result?.speakerPinned ?? null,
        route: result?.route || 'unknown',
      }
    );
    return true;
  } catch (error) {
    console.error(
      '[RealtimeVoiceNativeAudio] Failed to activate native realtime audio session:',
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
      '[RealtimeVoiceNativeAudio] Failed to restore native realtime audio state:',
      error
    );
  }
}
