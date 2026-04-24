import { setHeader } from 'h3';
import {
  buildAndroidStoreRedirectHtml,
  buildGooglePlayIntentUrl,
} from '../../../../../shared/utils/mobileAppLinks';

/**
 * Стабильный first-party маршрут для QR-кодов.
 * В сам QR кодируем HTTPS-ссылку Mentala, а не `market://`,
 * чтобы в будущем можно было менять логику без перевыпуска кода.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=300');
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');

  return buildAndroidStoreRedirectHtml({
    intentUrl: buildGooglePlayIntentUrl(),
  });
});
