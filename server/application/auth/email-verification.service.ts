import {
  AUTH_CODE_TTL_SECONDS,
  generateVerificationCode,
  getAuthSecrets,
  hashVerificationCode,
  storeVerificationRecord,
} from '@/server/application/auth/verification';
import { sendVerificationEmail } from '@/server/application/auth/email-sender';

export async function issueVerificationCode(
  redisKey: string,
  email: string
): Promise<void> {
  const code = generateVerificationCode();
  const secret = getAuthSecrets()[0];
  await storeVerificationRecord(
    redisKey,
    hashVerificationCode(code, secret),
    AUTH_CODE_TTL_SECONDS
  );
  await sendVerificationEmail(email, code);
}
