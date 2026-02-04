import { db } from '@/server/infrastructure/db/client';
import { notificationImageRotation } from '@/server/infrastructure/db/schema';
import { sql } from 'drizzle-orm';

const CUSTOM_ENTITY_KEY = '__custom__';

export function normalizeRotationEntityKey(entityKey: string | null): string {
  return entityKey ?? CUSTOM_ENTITY_KEY;
}

/**
 * Возвращает следующий индекс ротации (инкрементирует атомарно).
 * Хранит прогресс между перегенерациями и изменениями настроек.
 */
export async function getNextRotationIndex(params: {
  userId: number;
  kind: 'therapy' | 'habits';
  entityKey: string | null;
  imageTag: string;
}): Promise<number> {
  const normalizedEntityKey = normalizeRotationEntityKey(params.entityKey);

  const [row] = await db
    .insert(notificationImageRotation)
    .values({
      userId: params.userId,
      kind: params.kind,
      entityKey: normalizedEntityKey,
      imageTag: params.imageTag,
      lastIndex: 0,
    })
    .onConflictDoUpdate({
      target: [
        notificationImageRotation.userId,
        notificationImageRotation.kind,
        notificationImageRotation.entityKey,
        notificationImageRotation.imageTag,
      ],
      set: {
        lastIndex: sql`${notificationImageRotation.lastIndex} + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ lastIndex: notificationImageRotation.lastIndex });

  return typeof row?.lastIndex === 'number' ? row.lastIndex : 0;
}
