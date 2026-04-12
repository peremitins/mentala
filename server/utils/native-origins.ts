/**
 * Origin-ы нативных WebView, которые считаем доверенными для mobile release-сборок.
 * Android release у нас работает с `http://localhost`, iOS/Capacitor — с `capacitor://localhost`.
 */
export const NATIVE_APP_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'http://127.0.0.1',
] as const;
