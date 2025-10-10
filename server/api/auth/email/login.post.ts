import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '@/server/application/auth/session';
import argon2 from 'argon2';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email: string;
    password: string;
    locale?: string;
  }>(event as any);
  if (!body?.email || !body?.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing email or password',
    });
  }
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1);
  if (!existing.length || !existing[0].passwordHash) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
    });
  }
  const ok = await argon2.verify(existing[0].passwordHash!, body.password);
  if (!ok)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid credentials',
    });
  await db
    .update(users)
    .set({
      locale: body.locale ?? existing[0].locale,
      lastLoginAt: new Date(),
    })
    .where(eq(users.id, existing[0].id));
  await createSession(event, existing[0].id, body.locale);
  return {
    user: {
      id: existing[0].id,
      email: existing[0].email,
      name: existing[0].name,
      locale: body.locale ?? existing[0].locale,
    },
  };
});
