import { db } from '../infrastructure/db/client';
import { userResponseIds } from '../infrastructure/db/schema';
import { eq, and, gt } from 'drizzle-orm';

export const responseIdStore = {
  /**
   * Сохраняет response_id для пользователя
   * @param userId - ID пользователя
   * @param responseId - ID ответа от OpenAI Responses API
   */
  async save(userId: string, responseId: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 дней

    await db
      .insert(userResponseIds)
      .values({
        userId: String(userId),
        responseId,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: userResponseIds.userId,
        set: {
          responseId,
          expiresAt,
        },
      });
  },

  /**
   * Получает последний валидный response_id для пользователя
   * @param userId - ID пользователя
   * @returns response_id и expiresAt, если есть валидный, иначе null
   */
  async getLastValid(
    userId: string
  ): Promise<{ responseId: string; expiresAt: Date } | null> {
    const rows = await db
      .select()
      .from(userResponseIds)
      .where(
        and(
          eq(userResponseIds.userId, String(userId)),
          gt(userResponseIds.expiresAt, new Date())
        )
      )
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      responseId: row.responseId,
      expiresAt: row.expiresAt,
    };
  },

  /**
   * Удаляет response_id для пользователя
   * @param userId - ID пользователя
   */
  async delete(userId: string) {
    await db
      .delete(userResponseIds)
      .where(eq(userResponseIds.userId, String(userId)));
  },

  /**
   * Проверяет, валиден ли response_id (не истек ли срок)
   * @param expiresAt - Дата истечения
   * @returns true если валиден, false если истек
   */
  isResponseValid(expiresAt: Date): boolean {
    return expiresAt > new Date();
  },
};


