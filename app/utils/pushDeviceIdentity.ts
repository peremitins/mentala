import { Preferences } from '@capacitor/preferences';

const NATIVE_PUSH_INSTALLATION_ID_KEY = 'mentala.native.push.installation_id';

let cachedNativeInstallationId: string | null = null;

function createFallbackId(platform: 'ios' | 'android'): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `native:${platform}:${globalThis.crypto.randomUUID()}`;
  }

  return `native:${platform}:${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

/**
 * Возвращает стабильный идентификатор native-устройства для серверной
 * дедупликации push-каналов внутри одного физического устройства.
 */
export async function resolveNativePushInstallationId(
  platform: 'ios' | 'android'
): Promise<string | null> {
  if (cachedNativeInstallationId) return cachedNativeInstallationId;

  try {
    const { Device } = await import('@capacitor/device');
    const deviceId = await Device.getId();
    const identifier =
      typeof deviceId?.identifier === 'string'
        ? deviceId.identifier.trim()
        : '';

    if (identifier) {
      cachedNativeInstallationId = identifier;
      return identifier;
    }
  } catch (error) {
    console.warn('[PushDeviceIdentity] Device.getId failed:', error);
  }

  try {
    const stored = await Preferences.get({
      key: NATIVE_PUSH_INSTALLATION_ID_KEY,
    });
    const existing = stored.value?.trim();
    if (existing) {
      cachedNativeInstallationId = existing;
      return existing;
    }

    const generated = createFallbackId(platform);
    await Preferences.set({
      key: NATIVE_PUSH_INSTALLATION_ID_KEY,
      value: generated,
    });
    cachedNativeInstallationId = generated;
    return generated;
  } catch (error) {
    console.warn('[PushDeviceIdentity] fallback id failed:', error);
    return null;
  }
}
