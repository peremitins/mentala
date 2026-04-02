import { defineNuxtPlugin } from 'nuxt/app';
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core';

type NativeSafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type MentalaSafeAreaPlugin = {
  getInsets(): Promise<NativeSafeAreaInsets>;
  addListener(
    eventName: 'safeAreaChanged',
    listenerFunc: (insets: NativeSafeAreaInsets) => void
  ): Promise<PluginListenerHandle>;
};

const MentalaSafeArea =
  registerPlugin<MentalaSafeAreaPlugin>('MentalaSafeArea');

function canUseNativeSafeAreaBridge() {
  if (typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== 'android') return false;
  return Capacitor.isPluginAvailable('MentalaSafeArea');
}

function normalizeInset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function applyNativeSafeAreaInsets(insets: NativeSafeAreaInsets) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.style.setProperty(
    '--native-safe-area-inset-top',
    `${normalizeInset(insets.top)}px`
  );
  root.style.setProperty(
    '--native-safe-area-inset-right',
    `${normalizeInset(insets.right)}px`
  );
  root.style.setProperty(
    '--native-safe-area-inset-bottom',
    `${normalizeInset(insets.bottom)}px`
  );
  root.style.setProperty(
    '--native-safe-area-inset-left',
    `${normalizeInset(insets.left)}px`
  );
}

export default defineNuxtPlugin(async () => {
  if (!canUseNativeSafeAreaBridge()) {
    return;
  }

  try {
    const initialInsets = await MentalaSafeArea.getInsets();
    applyNativeSafeAreaInsets(initialInsets);

    await MentalaSafeArea.addListener('safeAreaChanged', (insets) => {
      applyNativeSafeAreaInsets(insets);
    });
  } catch (error) {
    console.warn('[NativeSafeArea] Failed to initialize:', error);
  }
});
