import { getSessionUser } from '@@/server/application/auth/session';
import { readChatSettings } from '@/server/utils/storage';
import { summaryStore } from '@/server/utils/summaryStore';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessionResult.user.id);
  const settings = await readChatSettings(String(uid));
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
