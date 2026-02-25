import { Capacitor, registerPlugin } from '@capacitor/core';

type MentalaAudioForegroundPlugin = {
  start(options?: { title?: string; subtitle?: string }): Promise<void>;
  stop(): Promise<void>;
};

const MentalaAudioForeground = registerPlugin<MentalaAudioForegroundPlugin>(
  'MentalaAudioForeground'
);

function canUseForegroundBridge() {
  if (typeof window === 'undefined') return false;
  if (Capacitor.getPlatform() !== 'android') return false;
  return Capacitor.isPluginAvailable('MentalaAudioForeground');
}

export async function startAudioForegroundService(options?: {
  title?: string;
  subtitle?: string;
}) {
  if (!canUseForegroundBridge()) return;
  try {
    await MentalaAudioForeground.start(options);
  } catch (error) {
    console.error('[AudioForegroundBridge] Failed to start service:', error);
  }
}

export async function stopAudioForegroundService() {
  if (!canUseForegroundBridge()) return;
  try {
    await MentalaAudioForeground.stop();
  } catch (error) {
    console.error('[AudioForegroundBridge] Failed to stop service:', error);
  }
}
