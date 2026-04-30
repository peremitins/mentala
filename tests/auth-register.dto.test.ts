import { describe, expect, it } from 'vitest';
import {
  AuthRegisterDto,
  AuthRegisterResponseDto,
  AuthRegisterValidationErrorDto,
  GoogleNativeAuthDto,
} from '../shared/dto/auth';

describe('AuthRegister DTO', () => {
  it('валидирует успешный ответ регистрации', () => {
    const parsed = AuthRegisterResponseDto.parse({
      userId: 123,
      email: 'user@example.com',
    });

    expect(parsed.userId).toBe(123);
    expect(parsed.email).toBe('user@example.com');
  });

  it('валидирует ошибку валидации регистрации', () => {
    const parsed = AuthRegisterValidationErrorDto.parse({
      error: 'validation',
      issues: [{ path: 'acceptTerms', message: 'Must be true' }],
    });

    expect(parsed.error).toBe('validation');
    expect(parsed.issues[0]?.path).toBe('acceptTerms');
  });

  it('принимает optional marketing attribution без breaking change', () => {
    const parsed = AuthRegisterDto.parse({
      email: 'user@example.com',
      password: 'password123',
      acceptTerms: true,
      acceptPrivacy: true,
      marketingAttribution: {
        utmSource: 'telega',
        utmMedium: 'telegram',
        utmCampaign: 'waytohap_20260430',
        utmContent: 'post_2_48_soft_support',
      },
    });

    expect(parsed.marketingAttribution?.utmContent).toBe(
      'post_2_48_soft_support'
    );
  });

  it('не валит регистрацию из-за слишком длинного attribution-поля', () => {
    const parsed = AuthRegisterDto.parse({
      email: 'user@example.com',
      password: 'password123',
      acceptTerms: true,
      acceptPrivacy: true,
      marketingAttribution: {
        utmSource: 'telega',
        utmCampaign: 'x'.repeat(121),
      },
    });

    expect(parsed.marketingAttribution?.utmSource).toBe('telega');
    expect(parsed.marketingAttribution?.utmCampaign).toBeUndefined();
  });

  it('принимает optional attribution в native OAuth DTO', () => {
    const parsed = GoogleNativeAuthDto.parse({
      idToken: 'x'.repeat(12),
      marketingAttribution: {
        utmSource: 'telega',
      },
    });

    expect(parsed.marketingAttribution?.utmSource).toBe('telega');
  });
});
