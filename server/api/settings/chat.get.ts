import { getSessionUser } from '@@/server/application/auth/session';
import { readChatSettings } from '@/server/utils/storage';
import { summaryStore } from '@/server/utils/summaryStore';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const sessUser = await getSessionUser(event);
  if (!sessUser?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessUser.id);
  const settings = readChatSettings(String(uid));
  const count = await summaryStore.countByUser(uid);

  // Загружаем активные промпты для всех типов
  const activePrompts = await db
    .select()
    .from(userPrompts)
    .where(and(eq(userPrompts.userId, uid), eq(userPrompts.isActive, true)));

  const activePromptsByType = {
    habits: activePrompts.find((p) => p.type === 'habits') || null,
    therapy: activePrompts.find((p) => p.type === 'therapy') || null,
  };

  return {
    settings: {
      ...settings,
      isFirstSession: count === 0,
      activePromptsByType,
    },
  };
});
