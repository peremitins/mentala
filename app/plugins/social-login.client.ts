import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

export default defineNuxtPlugin(async () => {
  if (typeof window === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;

  const config = useRuntimeConfig();
  const webClientId = config.public.googleWebClientId;
  const iosClientId = config.public.googleIosClientId;

  if (!webClientId) {
    console.warn('[SocialLogin] Missing googleWebClientId in runtime config');
    return;
  }

  const platform = Capacitor.getPlatform();
  const googleConfig: Record<string, any> = {
    webClientId,
    mode: 'online',
  };

  if (platform === 'ios') {
    if (!iosClientId) {
      console.warn('[SocialLogin] Missing googleIosClientId for iOS');
    } else {
      googleConfig.iOSClientId = iosClientId;
      googleConfig.iOSServerClientId = webClientId;
    }
  }

  try {
    await SocialLogin.initialize({
      google: googleConfig,
    });
  } catch (error) {
    console.error('[SocialLogin] Initialization failed:', error);
  }
});
