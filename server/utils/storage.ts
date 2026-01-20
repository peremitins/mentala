// Chat settings stored in PostgreSQL database
import { db } from '@@/server/infrastructure/db/client';
import { chatSettings } from '@@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

type ChatSettings = {
  theme: 'dark' | 'light';
  voice: boolean;
  avatar: boolean;
  enablePreviousResponseId: boolean;
  enableSummary: boolean;
};

const DEFAULT_SETTINGS: ChatSettings = {
  theme: 'dark',
  voice: true,
  avatar: false,
  enablePreviousResponseId: true,
  enableSummary: true,
};

export async function readChatSettings(uid: string): Promise<ChatSettings> {
  const userId = Number(uid);
  if (isNaN(userId)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const result = await db
      .select()
      .from(chatSettings)
      .where(eq(chatSettings.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return DEFAULT_SETTINGS;
    }

    const row = result[0];
    return {
      theme: (row.theme as 'dark' | 'light') || 'dark',
      voice: row.voice ?? true,
      avatar: row.avatar ?? true,
      enablePreviousResponseId: row.enablePreviousResponseId ?? true,
      enableSummary: row.enableSummary ?? true,
    };
  } catch (error) {
    console.error('[Storage] Error reading chat settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function writeChatSettings(
  uid: string,
  patch: Partial<ChatSettings>
): Promise<ChatSettings> {
  const userId = Number(uid);
  if (isNaN(userId)) {
    throw new Error('Invalid user ID');
  }

  try {
    const prev = await readChatSettings(uid);
    const next = { ...prev, ...patch };

    await db
      .insert(chatSettings)
      .values({
        userId,
        theme: next.theme,
        voice: next.voice,
        avatar: next.avatar,
        enablePreviousResponseId: next.enablePreviousResponseId,
        enableSummary: next.enableSummary,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: chatSettings.userId,
        set: {
          theme: next.theme,
          voice: next.voice,
          avatar: next.avatar,
          enablePreviousResponseId: next.enablePreviousResponseId,
          enableSummary: next.enableSummary,
          updatedAt: new Date(),
        },
      });

    return next;
  } catch (error) {
    console.error('[Storage] Error writing chat settings:', error);
    throw error;
  }
}

export async function deleteAll(uid: string): Promise<void> {
  const userId = Number(uid);
  if (isNaN(userId)) {
    return;
  }

  try {
    await db.delete(chatSettings).where(eq(chatSettings.userId, userId));
  } catch (error) {
    console.error('[Storage] Error deleting chat settings:', error);
  }
}
