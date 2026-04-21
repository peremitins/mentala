const DEFAULT_LANDING_SITE_URL = 'https://mentala.app';

export const ANDROID_APP_PACKAGE_ID = 'com.mentala.app';
export const LANDING_ANDROID_QR_PATH = '/go/android';
export const GOOGLE_PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_PACKAGE_ID}`;
export const GOOGLE_PLAY_MARKET_URL = `market://details?id=${ANDROID_APP_PACKAGE_ID}`;

interface AndroidStoreRedirectHtmlParams {
  appName?: string;
  homeUrl?: string;
  marketUrl?: string;
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
  const appName = String(params.appName || 'Mentala').trim() || 'Mentala';
  const homeUrl = String(params.homeUrl || '/').trim() || '/';
  const marketUrl = String(params.marketUrl || GOOGLE_PLAY_MARKET_URL).trim();
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
    <meta name="theme-color" content="#07111f" />
    <title>Открываем ${appName} в Google Play</title>
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(52, 211, 153, 0.18), transparent 34%),
          radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.16), transparent 30%),
          #07111f;
        color: #f8fafc;
      }

      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      .card {
        width: min(100%, 440px);
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(10, 18, 34, 0.86);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.4);
        padding: 28px;
        backdrop-filter: blur(18px);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(167, 243, 208, 0.92);
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.22);
      }

      h1 {
        margin: 18px 0 12px;
        font-size: 28px;
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: rgba(226, 232, 240, 0.8);
        line-height: 1.55;
      }

      .actions {
        display: grid;
        gap: 12px;
        margin-top: 24px;
      }

      .button {
        display: inline-flex;
        min-height: 54px;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        padding: 14px 18px;
        text-decoration: none;
        text-align: center;
        font-weight: 700;
        transition:
          transform 0.18s ease,
          border-color 0.18s ease,
          background 0.18s ease,
          color 0.18s ease;
      }

      .button:hover {
        transform: translateY(-1px);
      }

      .button-primary {
        color: #04111d;
        background: linear-gradient(135deg, #a7f3d0 0%, #67e8f9 100%);
      }

      .button-secondary {
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
      }

      .button-ghost {
        color: rgba(226, 232, 240, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: transparent;
      }

      .note {
        margin-top: 16px;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="card">
        <div class="badge">Android · Google Play</div>
        <h1>Открываем ${appName} в Google Play</h1>
        <p id="status-copy">
          Если ты уже на Android, магазин должен открыться автоматически.
        </p>
        <p id="note-copy" class="note">
          Если автопереход не сработал, используй кнопку ниже.
        </p>

        <div class="actions">
          <a class="button button-primary" href="${marketUrl}">
            Открыть в Google Play
          </a>
          <a
            class="button button-secondary"
            href="${playStoreUrl}"
            rel="nofollow noopener noreferrer"
          >
            Открыть web-страницу Google Play
          </a>
          <a class="button button-ghost" href="${homeUrl}">Вернуться на сайт</a>
        </div>
      </section>
    </main>

    <script>
      (() => {
        const marketUrl = ${JSON.stringify(marketUrl)};
        const statusNode = document.getElementById('status-copy');
        const noteNode = document.getElementById('note-copy');
        const isAndroid = /android/i.test(navigator.userAgent || '');

        if (!statusNode || !noteNode) {
          return;
        }

        if (!isAndroid) {
          statusNode.textContent =
            'Эта ссылка предназначена для Android-устройств.';
          noteNode.textContent =
            'Когда появится iPhone-маршрут, QR перевыпускать не придётся — логика уже живёт на стороне сайта.';
          return;
        }

        statusNode.textContent = 'Пробуем открыть Google Play…';
        noteNode.textContent =
          'Если магазин не открылся автоматически, нажми кнопку «Открыть в Google Play».';

        // QR всегда ведёт на https-ссылку Mentala, а магазин открываем уже на устройстве.
        window.location.replace(marketUrl);
      })();
    </script>
  </body>
</html>`;
}
