import {
  getAuthSecrets,
  hashPasswordResetToken,
  getPasswordResetRecord,
  maskEmail,
} from '@/server/application/auth/verification';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = String(query.token || '');

  if (!token) {
    return {
      valid: false,
      reason: 'invalid' as const,
    };
  }

  // Вычисляем хэш токена
  const secrets = getAuthSecrets();
  let record: any = null;

  // Пробуем все секреты (на случай ротации)
  for (const secret of secrets) {
    const tokenHash = hashPasswordResetToken(token, secret);
    const found = await getPasswordResetRecord(tokenHash);
    if (found) {
      record = found;
      break;
    }
  }

  // Если токен валиден
  if (record) {
    const maskedEmailValue = maskEmail(record.email);
    return {
      valid: true,
      maskedEmail: maskedEmailValue,
    };
  }

  // Если токен невалиден
  return {
    valid: false,
    reason: 'invalid' as const,
  };
});
