import { describe, expect, it } from 'vitest';
import {
  appendMarketingAttributionToUrl,
  extractMarketingAttributionFromQuery,
  normalizeMarketingAttribution,
} from '../shared/utils/marketingAttribution';
import { LandingLeadRequestDto } from '../shared/dto/landing';

describe('marketing attribution helpers', () => {
  it('извлекает только разрешенные marketing-параметры', () => {
    const attribution = extractMarketingAttributionFromQuery(
      {
        utm_source: ' telega ',
        utm_medium: 'telegram',
        utm_campaign: 'waytohap_20260430',
        utm_content: 'post_2_48_soft_support',
        utm_term: 'soft_support',
        yclid: '123',
        ignored: 'must_not_leak',
      },
      {
        landingUrl:
          'https://mentala.app/?utm_source=telega&utm_medium=telegram&ignored=must_not_leak',
        referrer: 'https://t.me/channel',
        capturedAt: '2026-04-30T10:00:00.000Z',
      }
    );

    expect(attribution).toMatchObject({
      utmSource: 'telega',
      utmMedium: 'telegram',
      utmCampaign: 'waytohap_20260430',
      utmContent: 'post_2_48_soft_support',
      utmTerm: 'soft_support',
      yclid: '123',
      landingUrl:
        'https://mentala.app/?utm_source=telega&utm_medium=telegram&utm_campaign=waytohap_20260430&utm_content=post_2_48_soft_support&utm_term=soft_support&yclid=123',
      referrer: 'https://t.me/channel',
    });
    expect(attribution?.rawParams).toEqual({
      utm_source: 'telega',
      utm_medium: 'telegram',
      utm_campaign: 'waytohap_20260430',
      utm_content: 'post_2_48_soft_support',
      utm_term: 'soft_support',
      yclid: '123',
    });
    expect(attribution?.rawParams).not.toHaveProperty('ignored');
  });

  it('добавляет attribution к абсолютному URL без потери существующих query', () => {
    const url = appendMarketingAttributionToUrl(
      'https://my.mentala.app/auth?ref=ABC',
      {
        utmSource: 'telega',
        utmMedium: 'telegram',
        utmCampaign: 'waytohap_20260430',
        utmContent: 'post_2_48_soft_support',
      }
    );

    expect(url).toBe(
      'https://my.mentala.app/auth?ref=ABC&utm_source=telega&utm_medium=telegram&utm_campaign=waytohap_20260430&utm_content=post_2_48_soft_support'
    );
  });

  it('возвращает undefined для пустой или невалидной attribution', () => {
    expect(normalizeMarketingAttribution({ ignored: 'value' })).toBeUndefined();
    expect(normalizeMarketingAttribution(null)).toBeUndefined();
  });

  it('отбрасывает слишком длинные поля без потери валидных параметров', () => {
    const attribution = normalizeMarketingAttribution({
      utmSource: 'telega',
      utmCampaign: 'x'.repeat(121),
      gclid: 'g'.repeat(255),
      fbclid: 'f'.repeat(256),
      rawParams: {
        utm_source: 'telega',
        utm_campaign: 'x'.repeat(2049),
        ignored: 'must_not_leak',
      },
    });

    expect(attribution).toMatchObject({
      utmSource: 'telega',
      gclid: 'g'.repeat(255),
    });
    expect(attribution?.utmCampaign).toBeUndefined();
    expect(attribution?.fbclid).toBeUndefined();
    expect(attribution?.rawParams).toEqual({ utm_source: 'telega' });
  });

  it('не валит landing lead DTO из-за слишком длинной legacy UTM-метки', () => {
    const parsed = LandingLeadRequestDto.parse({
      name: 'User',
      email: 'user@example.com',
      utmSource: 'telega',
      utmCampaign: 'x'.repeat(121),
    });

    expect(parsed.utmSource).toBe('telega');
    expect(parsed.utmCampaign).toBeUndefined();
  });
});
