import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { userToolkitItems } from '@/server/infrastructure/db/schema';
import type {
  ToolkitItemOrigin,
  ToolkitItemSource,
  ToolkitItemType,
  ToolkitToolRef,
  UserToolkitItem,
} from '@/shared/dto/toolkit';

type ToolkitRow = typeof userToolkitItems.$inferSelect;

function toDto(row: ToolkitRow): UserToolkitItem {
  return {
    id: row.id,
    type: row.type as ToolkitItemType,
    title: row.title,
    content: row.content ?? null,
    toolRef: (row.toolRef as ToolkitToolRef | null) ?? null,
    itemKey: row.itemKey ?? null,
    sources: (row.sources as ToolkitItemSource[] | null) ?? [],
    origin: row.origin as ToolkitItemOrigin,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Все элементы «Моего набора» пользователя. Сначала запускаемые практики/чат,
 * затем фразы — на фронте группируем по type, порядок внутри по дате создания.
 */
export async function listToolkitItems(
  userId: number
): Promise<UserToolkitItem[]> {
  const rows = await db
    .select()
    .from(userToolkitItems)
    .where(eq(userToolkitItems.userId, userId))
    .orderBy(desc(userToolkitItems.createdAt));
  return rows.map(toDto);
}

/**
 * Ручное добавление личной фразы (origin='manual'). Дедуп по тексту — повтор
 * той же фразы не создаёт дубликат, возвращаем существующую.
 */
export async function createToolkitPhrase(
  userId: number,
  content: string
): Promise<UserToolkitItem> {
  const [existing] = await db
    .select()
    .from(userToolkitItems)
    .where(
      and(
        eq(userToolkitItems.userId, userId),
        eq(userToolkitItems.type, 'phrase'),
        eq(userToolkitItems.content, content)
      )
    )
    .limit(1);

  if (existing) {
    return toDto(existing);
  }

  const [created] = await db
    .insert(userToolkitItems)
    .values({
      userId,
      type: 'phrase',
      title: content.slice(0, 120),
      content,
      toolRef: null,
      itemKey: null,
      sources: [],
      origin: 'manual',
    })
    .returning();

  return toDto(created);
}

/**
 * Редактирование текста личной фразы. Системные элементы (practice/ai_chat)
 * редактировать нельзя — вернём 404, если это не фраза пользователя.
 */
export async function updateToolkitPhrase(
  userId: number,
  id: number,
  content: string
): Promise<UserToolkitItem | null> {
  const [existing] = await db
    .select()
    .from(userToolkitItems)
    .where(
      and(eq(userToolkitItems.id, id), eq(userToolkitItems.userId, userId))
    )
    .limit(1);

  if (!existing || existing.type !== 'phrase') {
    return null;
  }

  const [updated] = await db
    .update(userToolkitItems)
    .set({
      content,
      title: content.slice(0, 120),
      updatedAt: new Date(),
    })
    .where(eq(userToolkitItems.id, id))
    .returning();

  return toDto(updated);
}

/**
 * Удаление любого элемента набора пользователя. Возвращает true, если удалили.
 */
export async function deleteToolkitItem(
  userId: number,
  id: number
): Promise<boolean> {
  const deleted = await db
    .delete(userToolkitItems)
    .where(
      and(eq(userToolkitItems.id, id), eq(userToolkitItems.userId, userId))
    )
    .returning({ id: userToolkitItems.id });
  return deleted.length > 0;
}
