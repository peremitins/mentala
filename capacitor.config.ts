import { CapacitorConfig } from '@capacitor/cli';

// Используем dev-сервер только если явно задано через переменную окружения
// Для production оставляем server пустым, чтобы использовались статические файлы
const isDevServer = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.mentala.app',
  appName: 'Ментала',
  webDir: '.output/public',
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
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#999999',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#000000',
      style: 'dark',
      // На Android: НЕ используем overlay, чтобы статус-бар не накладывался
      // Высоту статус-бара получаем программно и добавляем padding
      overlaysWebView: false,
      androidOverlaysWebView: false,
    },
    PushNotifications: {
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
  },
};

export default config;
