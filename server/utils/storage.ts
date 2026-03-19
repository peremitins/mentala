// Chat settings stored in PostgreSQL database
import { db } from '@@/server/infrastructure/db/client';
import { chatSettings } from '@@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { FEATURE_TTS_ENABLED } from '@/server/config/features';
import {
  normalizeLastTherapyFocus,
  type LastTherapyFocus,
} from '@/server/application/chat/phobias-entry.service';
import {
  DEFAULT_ASSISTANT_VOICE_ID,
  isAssistantVoiceSelectable,
  resolveAssistantVoiceId,
} from '@/shared/constants/assistantVoiceCatalog';

export type PublicChatSettings = {
  voice: boolean;
  assistantVoice: string;
  avatar: boolean;
  enablePreviousResponseId: boolean;
  enableSummary: boolean;
};

export type StoredChatSettings = PublicChatSettings & {
  lastTherapyFocus: LastTherapyFocus | null;
};

const DEFAULT_SETTINGS: StoredChatSettings = {
  // Чатовая озвучка управляется глобальным kill-switch.
  voice: FEATURE_TTS_ENABLED,
  assistantVoice: DEFAULT_ASSISTANT_VOICE_ID,
  avatar: false,
  enablePreviousResponseId: true,
  enableSummary: true,
  lastTherapyFocus: null,
};

export function getPublicChatSettings(
  settings: StoredChatSettings
): PublicChatSettings {
  return {
    voice: settings.voice,
    assistantVoice: settings.assistantVoice,
    avatar: settings.avatar,
    enablePreviousResponseId: settings.enablePreviousResponseId,
    enableSummary: settings.enableSummary,
  };
}

export async function readChatSettings(
  uid: string
): Promise<StoredChatSettings> {
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
    if (!row) {
      return DEFAULT_SETTINGS;
    }

    return {
      // При выключенном kill-switch принудительно отдаём false.
      voice: FEATURE_TTS_ENABLED ? (row.voice ?? true) : false,
      assistantVoice: resolveAssistantVoiceId(row.assistantVoice),
      avatar: row.avatar ?? true,
      enablePreviousResponseId: row.enablePreviousResponseId ?? true,
      enableSummary: row.enableSummary ?? true,
      lastTherapyFocus: normalizeLastTherapyFocus(row.lastTherapyFocus),
    };
  } catch (error) {
    console.error('[Storage] Error reading chat settings:', error);
    return DEFAULT_SETTINGS;
  }
}

export async function writeChatSettings(
  uid: string,
  patch: Partial<StoredChatSettings>
): Promise<StoredChatSettings> {
  const userId = Number(uid);
  if (isNaN(userId)) {
    throw new Error('Invalid user ID');
  }

  try {
    if (
      patch.assistantVoice !== undefined &&
      !isAssistantVoiceSelectable(patch.assistantVoice)
    ) {
      throw new Error('Unsupported assistant voice');
    }

    const prev = await readChatSettings(uid);
    const next = { ...prev, ...patch };
    next.assistantVoice = resolveAssistantVoiceId(next.assistantVoice);

    // Не даём включить voice, пока kill-switch выключен.
    if (!FEATURE_TTS_ENABLED) {
      next.voice = false;
    }

    await db
      .insert(chatSettings)
      .values({
        userId,
        voice: next.voice,
        assistantVoice: next.assistantVoice,
        avatar: next.avatar,
        enablePreviousResponseId: next.enablePreviousResponseId,
        enableSummary: next.enableSummary,
        lastTherapyFocus: next.lastTherapyFocus,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: chatSettings.userId,
        set: {
          voice: next.voice,
          assistantVoice: next.assistantVoice,
          avatar: next.avatar,
          enablePreviousResponseId: next.enablePreviousResponseId,
          enableSummary: next.enableSummary,
          lastTherapyFocus: next.lastTherapyFocus,
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
