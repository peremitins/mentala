import { describe, expect, it } from 'vitest';
import {
  GOOGLE_PLAY_MARKET_URL,
  GOOGLE_PLAY_WEB_URL,
  LANDING_ANDROID_QR_PATH,
  buildAndroidStoreRedirectHtml,
  buildGooglePlayIntentUrl,
  buildLandingAndroidQrUrl,
} from '../shared/utils/mobileAppLinks';

describe('buildGooglePlayIntentUrl', () => {
  it('собирает intent url с browser fallback', () => {
    expect(buildGooglePlayIntentUrl()).toBe(
      `intent://details?id=com.mentala.app#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(
        GOOGLE_PLAY_WEB_URL
      )};end`
    );
  });
});

describe('buildLandingAndroidQrUrl', () => {
  it('строит стабильный first-party url для QR без двойного слеша', () => {
    expect(buildLandingAndroidQrUrl('https://mentala.app/')).toBe(
      'https://mentala.app/go/android'
    );
  });

  it('если origin ещё неизвестен, возвращает относительный путь', () => {
    expect(buildLandingAndroidQrUrl('')).toBe(LANDING_ANDROID_QR_PATH);
  });
});

describe('buildAndroidStoreRedirectHtml', () => {
  it('встраивает noindex и обе ссылки на магазин', () => {
    const html = buildAndroidStoreRedirectHtml();

    expect(html).toContain('noindex,nofollow');
    expect(html).toContain(GOOGLE_PLAY_MARKET_URL);
    expect(html).toContain(GOOGLE_PLAY_WEB_URL);
    expect(html).toContain('window.location.replace(marketUrl);');
  });
});
