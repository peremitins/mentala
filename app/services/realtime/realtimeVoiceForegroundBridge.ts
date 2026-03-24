import { Capacitor, registerPlugin } from '@capacitor/core';

type MentalaRealtimeVoiceForegroundPlugin = {
  start(options?: { title?: string; subtitle?: string }): Promise<void>;
  stop(): Promise<void>;
};

const MentalaRealtimeVoiceForeground =
  registerPlugin<MentalaRealtimeVoiceForegroundPlugin>(
    'MentalaRealtimeVoiceForeground'
  );

function shouldAttemptRealtimeVoiceForegroundBridge() {
  if (typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== 'android') return false;

  return true;
}

export async function startRealtimeVoiceForegroundService(options?: {
  title?: string;
  subtitle?: string;
}) {
  if (!shouldAttemptRealtimeVoiceForegroundBridge()) {
    return false;
  }

  try {
    await MentalaRealtimeVoiceForeground.start(options);
    return true;
  } catch (error) {
    console.error(
      '[RealtimeVoiceForegroundBridge] Failed to start foreground service:',
      error
    );
    return false;
  }
}

export async function stopRealtimeVoiceForegroundService() {
  if (!shouldAttemptRealtimeVoiceForegroundBridge()) {
    return;
  }

  try {
    await MentalaRealtimeVoiceForeground.stop();
  } catch (error) {
    console.error(
      '[RealtimeVoiceForegroundBridge] Failed to stop foreground service:',
      error
    );
  }
}
