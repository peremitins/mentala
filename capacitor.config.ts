import { CapacitorConfig } from '@capacitor/cli';

// Используем dev-сервер только если явно задано через переменную окружения
// Для production оставляем server пустым, чтобы использовались статические файлы
const isDevServer = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.mentala.app',
  appName: 'Ментала',
  webDir: '.output/public',
  ios: {
    // Явно оставляем нативную маршрутизацию уведомлений включённой.
    // Это нужно и для foreground-показа, и для корректного action/tap flow.
    handleApplicationNotifications: true,
  },
  server: isDevServer
    ? {
        // Dev-сервер: загружаем приложение с dev-сервера
        url: isDevServer,
        androidScheme: 'http',
        cleartext: true,
      }
    : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: '#090B12',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      spinnerColor: '#999999',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#000000',
      style: 'dark',
      // На Android < 15 Capacitor ещё может отдать WebView ниже status bar.
      // На Android 15+ / 16+ система навязывает edge-to-edge, поэтому layout
      // всё равно обязан учитывать реальные safe insets через CSS env().
      overlaysWebView: false,
      androidOverlaysWebView: false,
    },
    PushNotifications: {
      // Используем стандартный native foreground-показ Capacitor/iOS.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_mentala',
      iconColor: '#488AFF',
    },
    NativeAudio: {
      // HLS не используем для текущих медитаций, чтобы не увеличивать APK лишними зависимостями.
      hls: false,
    },
    SocialLogin: {
      // Используем только Google-логин; Facebook, Apple и Twitter отключены,
      // чтобы не тянуть лишние SDK (в т.ч. Facebook → AD_ID permission).
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
