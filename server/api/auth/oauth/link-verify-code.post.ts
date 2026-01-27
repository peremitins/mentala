import { createError } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { OAuthLinkVerifyCodeDto } from '@/shared/dto/auth';
import {
  getLinkingData,
  LINKING_MAX_ATTEMPTS,
  registerLinkAttempt,
  getLinkCodeKey,
} from '@/server/application/auth/oauth-linking';
import { verifyStoredCode } from '@/server/application/auth/verification';
import {
  buildOAuthAuthResponse,
  finalizeOAuthLink,
} from '@/server/application/auth/oauth-linking.service';

export default defineEventHandler(async (event) => {
  const body = OAuthLinkVerifyCodeDto.parse(await readBody(event as any));
  const linkingToken = body.linkingToken;

  const linkingData = await getLinkingData(linkingToken);
  if (!linkingData) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Недействительный токен привязки',
    });
  }

  if (linkingData.attempts >= LINKING_MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: 'Слишком много попыток' });
  }

  const codeResult = await verifyStoredCode(
    getLinkCodeKey(linkingToken),
    body.code
  );
  if (!codeResult.ok) {
    const attempt = await registerLinkAttempt(linkingToken, linkingData);
    if (!attempt.allowed || codeResult.reason === 'attempts_exceeded') {
      throw createError({
        statusCode: 429,
        statusMessage: 'Слишком много попыток',
      });
    }
    throw createError({
      statusCode: 400,
      statusMessage: 'Неверный или истекший код',
      data: { attemptsLeft: codeResult.attemptsLeft },
    });
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, linkingData.email))
    .limit(1);
  if (!userRows.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Недействительный токен привязки',
    });
  }

  await finalizeOAuthLink(event, linkingToken, linkingData, userRows[0].id);
  return buildOAuthAuthResponse(event, userRows[0].id);
});
