import { createError } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { OAuthLinkVerifyPasswordDto } from '@/shared/dto/auth';
import {
  getLinkingData,
  LINKING_MAX_ATTEMPTS,
  registerLinkAttempt,
} from '@/server/application/auth/oauth-linking';
import {
  buildOAuthAuthResponse,
  finalizeOAuthLink,
} from '@/server/application/auth/oauth-linking.service';

export default defineEventHandler(async (event) => {
  const body = OAuthLinkVerifyPasswordDto.parse(await readBody(event as any));
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

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, linkingData.email))
    .limit(1);
  if (!userRows.length || !userRows[0].passwordHash) {
    await registerLinkAttempt(linkingToken, linkingData);
    throw createError({ statusCode: 401, statusMessage: 'Неверные учетные данные' });
  }

  const ok = await argon2.verify(userRows[0].passwordHash, body.password);
  if (!ok) {
    const attempt = await registerLinkAttempt(linkingToken, linkingData);
    if (!attempt.allowed) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Слишком много попыток',
      });
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверные учетные данные',
    });
  }

  await finalizeOAuthLink(event, linkingToken, linkingData, userRows[0].id);

  return buildOAuthAuthResponse(event, userRows[0].id);
});
