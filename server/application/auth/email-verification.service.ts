import {
  AUTH_CODE_TTL_SECONDS,
  deleteRedisKey,
  generateVerificationCode,
  getAuthSecrets,
  hashVerificationCode,
  maskEmail,
  storeVerificationRecord,
} from '@/server/application/auth/verification';
import { sendVerificationEmail } from '@/server/application/auth/email-sender';

export async function issueVerificationCode(
  redisKey: string,
  email: string
): Promise<void> {
  const code = generateVerificationCode();
  const secret = getAuthSecrets()[0];
  try {
    await storeVerificationRecord(
      redisKey,
      hashVerificationCode(code, secret),
      AUTH_CODE_TTL_SECONDS
    );
    await sendVerificationEmail(email, code);
  } catch (error: any) {
    // Чистим код из Redis, чтобы не оставлять "висячие" записи
    try {
      await deleteRedisKey(redisKey);
    } catch (cleanupError) {
      console.error(
        `[Email] Failed to cleanup verification code for ${maskEmail(email)}:`,
        cleanupError
      );
    }

    throw error;
  }
}
