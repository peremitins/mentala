import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryEntries } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import {
  buildEntryCreatedAt,
  isFutureEntryDate,
  resolveEntryTimezone,
} from '@/server/application/gratitude-diary/entry-date';
import { deleteFromStorage } from '@/server/infrastructure/storage/upload';
import { GratitudeDiaryEntryUpdateDto } from '@/shared/dto';

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

  await assertGratitudeDiaryAccess({
    userId: Number(sessionResult.user.id),
    roleId: sessionResult.user.roleId,
  });

  const idRaw = getRouterParam(event, 'id') || '';
  const entryId = Number(idRaw);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Invalid entry id' } as const;
  }

  const body = await readBody(event);
  const parsed = GratitudeDiaryEntryUpdateDto.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const userId = Number(sessionResult.user.id);
  const timezone = resolveEntryTimezone(event);

  if (isFutureEntryDate(parsed.data.entryDate, timezone)) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Entry date cannot be in the future',
    } as const;
  }

  // Читаем текущую запись чтобы знать старый photoStorageKey перед обновлением.
  // Это необходимо для удаления старого объекта из хранилища после успешного сохранения.
  const [current] = await db
    .select({
      id: gratitudeDiaryEntries.id,
      createdAt: gratitudeDiaryEntries.createdAt,
      photoStorageKey: gratitudeDiaryEntries.photoStorageKey,
    })
    .from(gratitudeDiaryEntries)
    .where(
      and(
        eq(gratitudeDiaryEntries.id, entryId),
        eq(gratitudeDiaryEntries.userId, userId)
      )
    )
    .limit(1);

  if (!current) {
    setResponseStatus(event, 404);
    return { error: true, message: 'Entry not found' } as const;
  }

  const now = new Date();
  const data = parsed.data;

  // Шаг 1: сохраняем обновление в БД.
  const [item] = await db
    .update(gratitudeDiaryEntries)
    .set({
      text: data.text,
      mood: data.mood,
      tags: normalizeTags(data.tags),
      photoUrl: data.photoUrl,
      photoStorageKey: data.photoStorageKey ?? null,
      promptText: data.promptText ?? null,
      inputMethod: data.inputMethod,
      createdAt: buildEntryCreatedAt({
        entryDate: data.entryDate,
        timezone,
        preserveTimeFrom: current.createdAt,
      }),
      updatedAt: now,
    })
    .where(
      and(
        eq(gratitudeDiaryEntries.id, entryId),
        eq(gratitudeDiaryEntries.userId, userId)
      )
    )
    .returning();

  if (!item) {
    setResponseStatus(event, 404);
    return { error: true, message: 'Entry not found' } as const;
  }

  // Шаг 2: только после успешного сохранения в БД удаляем старый объект из хранилища.
  // Порядок строгий: сначала БД, потом Storage — защита от потери фото пользователя.
  // Ошибка удаления не откатывает транзакцию — только логируется.
  const oldKey = current.photoStorageKey;
  const newKey = data.photoStorageKey ?? null;
  const photoChanged = oldKey !== null && oldKey !== newKey;

  if (photoChanged) {
    await deleteFromStorage(oldKey);
  }

  return { item };
});
