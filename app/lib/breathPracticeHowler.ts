import { Capacitor } from '@capacitor/core';
import { isDocumentAvailable } from '@/app/utils/document';

const DEFAULT_HTML5_POOL_SIZE = 16;
const ANDROID_HTML5_POOL_SIZE = 24;

let howlerModulePromise: Promise<typeof import('howler') | null> | null = null;

/**
 * Конфигурирует общий Howler один раз для дыхательных практик.
 * На Android увеличиваем html5 pool, потому что voice/cue используют
 * несколько параллельных HTML5 Audio nodes и дефолтного лимита 10
 * в WebView часто не хватает.
 */
export async function getBreathPracticeHowlerModule(): Promise<
  typeof import('howler') | null
> {
  if (
    process.server ||
    typeof window === 'undefined' ||
    !isDocumentAvailable()
  ) {
    return null;
  }

  if (!howlerModulePromise) {
    howlerModulePromise = import('howler').then((module) => {
      const poolSize =
        Capacitor.getPlatform() === 'android'
          ? ANDROID_HTML5_POOL_SIZE
          : DEFAULT_HTML5_POOL_SIZE;

      module.Howler.autoUnlock = true;
      module.Howler.html5PoolSize = Math.max(
        module.Howler.html5PoolSize,
        poolSize
      );

      return module;
    });
  }

  return howlerModulePromise;
}
