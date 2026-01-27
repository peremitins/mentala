import { db } from '../infrastructure/db/client';
import { welcomePrompts } from '../infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Утилита для работы с welcome-промптами (стартовые приветствия ассистента)
 */
export const welcomePromptStore = {
  /**
   * Получить welcome-промпт для пользователя по флагу первой сессии
   * @param userId - ID пользователя
   * @param isFirstSession - true для первой сессии, false для повторных
   * @param lang - Язык (по умолчанию 'ru')
   * @returns Promise<string | null> - Содержимое промпта или null, если не найден
   */
  async get(
    userId: string | number,
    isFirstSession: boolean,
    lang: string = 'ru'
  ): Promise<string | null> {
    try {
      const rows = await db
        .select()
        .from(welcomePrompts)
        .where(
          and(
            eq(welcomePrompts.userId, Number(userId)),
            eq(welcomePrompts.isFirstSession, isFirstSession),
            eq(welcomePrompts.lang, lang),
            eq(welcomePrompts.isActive, true)
          )
        )
        .limit(1);

      if (rows.length > 0) {
        return rows[0].content || null;
      }
      return null;
    } catch (err) {
      console.error('[welcomePromptStore] Failed to get welcome prompt:', err);
      return null;
    }
  },

  /**
   * Получить дефолтный welcome-промпт (для пользователя с userId=0 или null)
   * @param isFirstSession - true для первой сессии, false для повторных
   * @param lang - Язык (по умолчанию 'ru')
   * @returns Promise<string | null>
   */
  async getDefault(
    isFirstSession: boolean,
    lang: string = 'ru'
  ): Promise<string | null> {
    try {
      // Ищем промпт для userId=0 (дефолтные/системные промпты)
      const rows = await db
        .select()
        .from(welcomePrompts)
        .where(
          and(
            eq(welcomePrompts.userId, 0),
            eq(welcomePrompts.isFirstSession, isFirstSession),
            eq(welcomePrompts.lang, lang),
            eq(welcomePrompts.isActive, true)
          )
        )
        .limit(1);

      if (rows.length > 0) {
        return rows[0].content || null;
      }
      return null;
    } catch (err) {
      console.error(
        '[welcomePromptStore] Failed to get default welcome prompt:',
        err
      );
      return null;
    }
  },

  /**
   * Сохранить или обновить welcome-промпт для пользователя
   */
  async save(
    userId: string | number,
    isFirstSession: boolean,
    content: string,
    lang: string = 'ru'
  ): Promise<void> {
    try {
      await db
        .insert(welcomePrompts)
        .values({
          userId: Number(userId),
          isFirstSession,
          content,
          lang,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [
            welcomePrompts.userId,
            welcomePrompts.isFirstSession,
            welcomePrompts.lang,
          ],
          set: {
            content,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.error('[welcomePromptStore] Failed to save welcome prompt:', err);
      throw err;
    }
  },
};
