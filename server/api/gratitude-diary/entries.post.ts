import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryEntries } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import {
  buildEntryCreatedAt,
  isFutureEntryDate,
  resolveEntryTimezone,
} from '@/server/application/gratitude-diary/entry-date';
import { GratitudeDiaryEntryCreateDto } from '@/shared/dto';

function normalizeTags(tags: string[]): string[] {
  const unique = new Set<string>();

  for (const rawTag of tags) {
    const normalized = rawTag.trim().toLowerCase().slice(0, 32);
    if (!normalized) continue;
    unique.add(normalized);
  }

  return Array.from(unique).slice(0, 10);
}

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const body = await readBody(event);
  const parsed = GratitudeDiaryEntryCreateDto.safeParse(body);

  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const now = new Date();
  const data = parsed.data;
  const timezone = resolveEntryTimezone(event);

  if (isFutureEntryDate(data.entryDate, timezone)) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Entry date cannot be in the future',
    } as const;
  }

  const [item] = await db
    .insert(gratitudeDiaryEntries)
    .values({
      userId: Number(sessionResult.user.id),
      text: data.text,
      mood: data.mood,
      tags: normalizeTags(data.tags),
      photoUrl: data.photoUrl,
      // Ключ объекта в хранилище — null для записей без фото или с legacy-URL
      photoStorageKey: data.photoStorageKey ?? null,
      promptText: data.promptText ?? null,
      inputMethod: data.inputMethod,
      createdAt: buildEntryCreatedAt({
        entryDate: data.entryDate,
        timezone,
      }),
      updatedAt: now,
    })
    .returning();

  return { item };
});
