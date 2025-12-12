import { readBody } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { writeChatSettings } from '@/server/utils/storage';
import { summaryStore } from '@/server/utils/summaryStore';
import { db } from '@@/server/infrastructure/db/client';
import { userPrompts } from '@@/server/infrastructure/db/schema';
import { and, eq } from 'drizzle-orm';

type Payload = Partial<{
  theme: 'dark' | 'light';
  mode: 'therapy' | 'habits';
  voice: boolean;
  avatar: boolean;
  enablePreviousResponseId: boolean;
  enableSummary: boolean;
}>;

export default defineEventHandler(async (event) => {
  const sessUser = await getSessionUser(event);
  if (!sessUser?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessUser.id);
  const body = await readBody<Payload>(event);
  const next = await writeChatSettings(String(uid), body || {});

  // Загружаем дополнительные данные как в GET endpoint
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
      ...next,
      isFirstSession: count === 0,
      activePromptsByType,
    },
  };
});
