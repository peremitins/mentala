import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

const GOOGLE_CLIENT_ID_REGEX = /\.apps\.googleusercontent\.com$/i;

export default defineNuxtPlugin(async () => {
  if (typeof window === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;

  const config = useRuntimeConfig();
  const webClientId = String(config.public.googleWebClientId || '').trim();
  const iosClientId = String(config.public.googleIosClientId || '').trim();

  if (!webClientId || !GOOGLE_CLIENT_ID_REGEX.test(webClientId)) {
    console.error(
      '[SocialLogin] Missing or invalid googleWebClientId in runtime config'
    );
    return;
  }

  const platform = Capacitor.getPlatform();
  const googleConfig: Record<string, any> = {
    webClientId,
    mode: 'online',
  };

  if (platform === 'ios') {
    // Для iOS iOSClientId обязателен: без него плагин вернёт "No provider was initialized".
    if (!iosClientId || !GOOGLE_CLIENT_ID_REGEX.test(iosClientId)) {
      console.error(
        '[SocialLogin] Missing or invalid googleIosClientId for iOS. Set NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID and rebuild iOS app.'
      );
      return;
    }
    googleConfig.iOSClientId = iosClientId;
    googleConfig.iOSServerClientId = webClientId;
  }

  try {
    await SocialLogin.initialize({
      google: googleConfig,
    });
  } catch (error) {
    console.error('[SocialLogin] Initialization failed:', error);
  }
});
