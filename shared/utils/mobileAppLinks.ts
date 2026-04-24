const DEFAULT_LANDING_SITE_URL = 'https://mentala.app';

export const ANDROID_APP_PACKAGE_ID = 'com.mentala.app';
export const LANDING_ANDROID_QR_PATH = '/go/android';
export const GOOGLE_PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_PACKAGE_ID}`;
export const GOOGLE_PLAY_MARKET_URL = `market://details?id=${ANDROID_APP_PACKAGE_ID}`;

interface AndroidStoreRedirectHtmlParams {
  intentUrl?: string;
  playStoreUrl?: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function buildGooglePlayIntentUrl(
  browserFallbackUrl: string = GOOGLE_PLAY_WEB_URL
): string {
  return `intent://details?id=${ANDROID_APP_PACKAGE_ID}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(
    browserFallbackUrl
  )};end`;
}

export function buildLandingAndroidQrUrl(
  landingSiteUrl: string = DEFAULT_LANDING_SITE_URL
): string {
  const normalizedSiteUrl = trimTrailingSlash(
    String(landingSiteUrl || '').trim()
  );

  if (!normalizedSiteUrl) {
    return LANDING_ANDROID_QR_PATH;
  }

  return `${normalizedSiteUrl}${LANDING_ANDROID_QR_PATH}`;
}

export function buildAndroidStoreRedirectHtml(
  params: AndroidStoreRedirectHtmlParams = {}
): string {
  const intentUrl = String(
    params.intentUrl || buildGooglePlayIntentUrl()
  ).trim();
  const playStoreUrl = String(
    params.playStoreUrl || GOOGLE_PLAY_WEB_URL
  ).trim();

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
    />
    <meta name="robots" content="noindex,nofollow" />
    <title>Google Play Redirect</title>
    <meta http-equiv="refresh" content="0;url=${playStoreUrl}" />
  </head>
  <body>
    <noscript>
      <a href="${playStoreUrl}" rel="nofollow noopener noreferrer">
        Открыть Google Play
      </a>
    </noscript>

    <script>
      (() => {
        const intentUrl = ${JSON.stringify(intentUrl)};
        const playStoreUrl = ${JSON.stringify(playStoreUrl)};
        const isAndroid = /android/i.test(navigator.userAgent || '');

        if (!isAndroid) {
          window.location.replace(playStoreUrl);
          return;
        }

        let fallbackUsed = false;

        const fallbackToWeb = () => {
          if (fallbackUsed) return;
          fallbackUsed = true;
          window.location.replace(playStoreUrl);
        };

        // Если у браузера / WebView нет handler-а для intent, тихо откатываемся на web-url.
        window.setTimeout(fallbackToWeb, 900);
        window.location.replace(intentUrl);
      })();
    </script>
  </body>
</html>`;
}
