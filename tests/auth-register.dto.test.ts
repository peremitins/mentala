import { describe, expect, it } from 'vitest';
import {
  AuthRegisterResponseDto,
  AuthRegisterValidationErrorDto,
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
});
