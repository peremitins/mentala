import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { defineNuxtPlugin, onNuxtReady, useRouter } from 'nuxt/app';
import { nextTick } from 'vue';

const IOS_MIN_SPLASH_VISIBLE_MS = 650;
const ANDROID_MIN_SPLASH_VISIBLE_MS = 0;

function waitForFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default defineNuxtPlugin(() => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const platform = Capacitor.getPlatform();
  const minSplashVisibleMs =
    platform === 'ios'
      ? IOS_MIN_SPLASH_VISIBLE_MS
      : ANDROID_MIN_SPLASH_VISIBLE_MS;
  let hidden = false;

  onNuxtReady(async () => {
    if (hidden) return;
    hidden = true;

    try {
      const router = useRouter();

      await router.isReady();
      await nextTick();
      await waitForFrame();
      await waitForFrame();
      if (minSplashVisibleMs > 0) {
        await wait(minSplashVisibleMs);
      }

      // Убираем без fade, чтобы не создавать визуальный morph между
      // нативным splash и первым экраном приложения.
      await SplashScreen.hide({ fadeOutDuration: 0 });
    } catch (error) {
      console.warn('[SplashScreen] Failed to hide splash screen:', error);
    }
  });
});
