import { CapacitorConfig } from '@capacitor/cli';

// Используем dev-сервер только если явно задано через переменную окружения
// Для production оставляем server пустым, чтобы использовались статические файлы
const isDevServer = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.mentai.app',
  appName: 'MentAI',
  webDir: '.output/public',
  server: isDevServer
    ? {
        // Dev-сервер: загружаем приложение с dev-сервера
        url: isDevServer,
        androidScheme: 'http',
        cleartext: true,
      }
    : {
        // Production: используем статические файлы, но через HTTP схему
        // чтобы избежать Mixed Content (API идёт по HTTP)
        androidScheme: 'http',
        cleartext: true,
      },
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
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
    },
  },
};

export default config;
