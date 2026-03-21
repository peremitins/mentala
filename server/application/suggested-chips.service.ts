import { chatViaProvider } from '@/server/application/llm.service';
import { config } from '@/server/config';
import {
  SuggestedChipIntentEnum,
  SuggestedChipActionEnum,
  SuggestedChipKindEnum,
  type ChatEntryContext,
  type SuggestedChip,
  type SuggestedChipIntent,
  type SuggestedChipKind,
  type SuggestedChipAction,
} from '@/shared/dto';
import {
  buildLegacySuggestedChipActionPayload,
  parseAppNavigationTarget,
  resolveTargetFromLegacySuggestedChipAction,
} from '@/shared/navigation';
import type { OnboardingReasons } from '@/shared/dto/onboarding';
import {
  buildSuggestedChipsUserPrompt,
  suggestedChipsSystemPrompt,
  suggestedChipsDeveloperPrompt,
} from '@/server/application/prompts';
import { readChatSettings } from '@/server/utils/storage';
import {
  buildStaticPhobiasSuggestedChips,
  resolvePhobiasConversationState,
} from '@/server/application/chat/phobias-entry.service';
import { buildNavigationSuggestedChips } from '@/server/application/navigation/chat-navigation.service';

const MAX_CHIPS = 3;
const MAX_CONTEXT_MESSAGES = 4;
const MAX_MESSAGE_LENGTH = 70;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function normalizeIntent(value: string | undefined): SuggestedChipIntent {
  if (!value) return 'clarify';
  const parsed = SuggestedChipIntentEnum.safeParse(value);
  return parsed.success ? parsed.data : 'clarify';
}

function normalizeKind(value: string | undefined): SuggestedChipKind {
  if (!value) return 'text';
  const parsed = SuggestedChipKindEnum.safeParse(value);
  return parsed.success ? parsed.data : 'text';
}

function normalizeAction(
  value: string | undefined
): SuggestedChipAction | null {
  if (!value) return null;
  const parsed = SuggestedChipActionEnum.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeActionParams(
  action: SuggestedChipAction,
  params: unknown
):
  | {
      trackId?: string;
      collectionId?: string;
      practiceId?: string;
      groupKey?: 'popular' | 'sleep' | 'anxiety' | 'focus' | 'custom';
      sosEntry?: 'panic' | 'tension' | 'technique_picker';
      topicKey?: string;
      habitKey?: string;
      source?: 'chat';
    }
  | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const raw = params as Record<string, unknown>;
  const normalized = {
    trackId: typeof raw.trackId === 'string' ? raw.trackId : undefined,
    collectionId:
      typeof raw.collectionId === 'string' ? raw.collectionId : undefined,
    practiceId: typeof raw.practiceId === 'string' ? raw.practiceId : undefined,
    groupKey: typeof raw.groupKey === 'string' ? raw.groupKey : undefined,
    sosEntry: typeof raw.sosEntry === 'string' ? raw.sosEntry : undefined,
    topicKey: typeof raw.topicKey === 'string' ? raw.topicKey : undefined,
    habitKey: typeof raw.habitKey === 'string' ? raw.habitKey : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };

  if (action === 'open_meditation_track' && !normalized.trackId) {
    return undefined;
  }
  if (action === 'open_meditations_collection' && !normalized.collectionId) {
    return undefined;
  }
  if (action === 'open_breath_practice' && !normalized.practiceId) {
    return undefined;
  }
  if (action === 'open_sos' && !normalized.sosEntry) {
    return undefined;
  }
  if (action === 'open_therapy_topic' && !normalized.topicKey) {
    return undefined;
  }
  if (action === 'open_habit' && !normalized.habitKey) {
    return undefined;
  }
  return normalized;
}

function normalizeChip(raw: {
  text?: string;
  intent?: string;
  kind?: string;
  action?: string;
  params?: unknown;
  target?: unknown;
}): SuggestedChip | null {
  const text = String(raw?.text || '')
    .trim()
    .replace(/^["«»]+|["«»]+$/g, '');
  if (!text || text.length > 80) return null;

  const intent = normalizeIntent(raw?.intent);
  const kind = normalizeKind(raw?.kind);
  const target = parseAppNavigationTarget(raw?.target);

  if (kind === 'action') {
    const action = normalizeAction(raw?.action);
    const params = action
      ? normalizeActionParams(action, raw?.params)
      : undefined;
    const resolvedTarget =
      target ??
      resolveTargetFromLegacySuggestedChipAction({
        action,
        params: params ?? undefined,
      });
    const compat =
      action && params
        ? { action, params }
        : resolvedTarget
          ? buildLegacySuggestedChipActionPayload(resolvedTarget)
          : null;

    if (resolvedTarget || compat?.action) {
      return {
        text,
        intent,
        kind,
        action: compat?.action,
        params: compat?.params,
        target: resolvedTarget ?? undefined,
      };
    }
  }

  return {
    text,
    intent,
    kind: 'text',
  };
}

function trimMessages(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => String(m.content || '').trim().length > 0)
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, MAX_MESSAGE_LENGTH),
    }))
    .slice(-MAX_CONTEXT_MESSAGES);
}

function buildDialogContext(messages: ChatMessage[]): string {
  const trimmed = trimMessages(messages);
  if (!trimmed.length) return '';

  return trimmed
    .map((m) =>
      m.role === 'user'
        ? `Пользователь: ${m.content}`
        : `Ассистент: ${m.content}`
    )
    .join('\n');
}

function parseJsonPayload(raw: string): unknown {
  const text = String(raw || '').trim();
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? text).trim();

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalizeChipsPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.chips)) return payload;

  const chips = record.chips.map((chip) => {
    if (!chip || typeof chip !== 'object') return chip;
    const chipRecord = { ...(chip as Record<string, unknown>) };

    // Убираем null-поля, чтобы Zod не отбрасывал валидные чипы.
    if (chipRecord.action === null) {
      delete chipRecord.action;
    }
    if (chipRecord.target === null) {
      delete chipRecord.target;
    }

    const params = chipRecord.params;
    if (params === null || typeof params !== 'object') {
      delete chipRecord.params;
    } else {
      const paramsRecord = { ...(params as Record<string, unknown>) };
      if (paramsRecord.trackId === null) {
        delete paramsRecord.trackId;
      }
      if (paramsRecord.collectionId === null) {
        delete paramsRecord.collectionId;
      }
      if (paramsRecord.practiceId === null) {
        delete paramsRecord.practiceId;
      }
      if (paramsRecord.groupKey === null) {
        delete paramsRecord.groupKey;
      }
      if (paramsRecord.sosEntry === null) {
        delete paramsRecord.sosEntry;
      }
      if (paramsRecord.topicKey === null) {
        delete paramsRecord.topicKey;
      }
      if (paramsRecord.habitKey === null) {
        delete paramsRecord.habitKey;
      }
      if (Object.keys(paramsRecord).length === 0) {
        delete chipRecord.params;
      } else {
        chipRecord.params = paramsRecord;
      }
    }

    return chipRecord;
  });

  return {
    ...record,
    chips,
  };
}

async function requestChipsFromModel(params: {
  dialogContext: string;
  assistantAnswer: string;
  maxChips: number;
  onboardingReasons?: OnboardingReasons;
  userId?: number | string;
  sessionId?: string;
}): Promise<SuggestedChip[]> {
  if (params.maxChips <= 0) {
    return [];
  }

  const userPrompt = buildSuggestedChipsUserPrompt({
    dialog_context: params.dialogContext,
    assistant_answer: params.assistantAnswer,
    max_chips: params.maxChips,
    onboardingReasons: params.onboardingReasons,
  });

  const result = await chatViaProvider({
    provider: 'openai',
    model: config.llm.openai.models.chips,
    messages: [
      { role: 'system', content: suggestedChipsSystemPrompt },
      { role: 'developer', content: suggestedChipsDeveloperPrompt },
      { role: 'user', content: userPrompt },
    ],
    options: {
      scenario: 'chips',
      userId: params.userId,
      sessionId: params.sessionId,
    },
  });

  const payload = normalizeChipsPayload(parseJsonPayload(result.content));
  const rawChips =
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { chips?: unknown[] }).chips)
      ? ((payload as { chips: unknown[] }).chips as Array<
          Record<string, unknown>
        >)
      : [];

  return rawChips
    .slice(0, MAX_CHIPS)
    .map((chip) => normalizeChip(chip))
    .filter((chip): chip is SuggestedChip => chip !== null);
}

export async function generateSuggestedChips(params: {
  messages: ChatMessage[];
  assistantAnswer: string;
  sessionId?: string;
  userId?: number | string;
  therapySessionId?: number | null;
  entryContext?: ChatEntryContext | null;
  onboardingReasons?: OnboardingReasons;
}) {
  if (
    params.entryContext?.type === 'sos' &&
    params.entryContext.sos_entry === 'vent' &&
    params.messages.length === 0
  ) {
    return buildNavigationSuggestedChips({
      messages: params.messages,
      entryContext: {
        type: 'sos',
        sos_entry: 'vent',
      },
    });
  }

  if (params.userId != null) {
    try {
      const settings = await readChatSettings(String(params.userId));
      const phobiasState = resolvePhobiasConversationState({
        entryContext: params.entryContext,
        messages: params.messages,
        lastTherapyFocus: settings.lastTherapyFocus,
      });
      const staticPhobiasChips = buildStaticPhobiasSuggestedChips(phobiasState);
      if (staticPhobiasChips) {
        return staticPhobiasChips;
      }
    } catch (error) {
      console.error(
        '[SuggestedChips] Failed to resolve phobias static chips:',
        error
      );
    }
  }

  const answer = String(params.assistantAnswer || '').trim();
  const navigationChips = await buildNavigationSuggestedChips({
    messages: params.messages,
    entryContext: params.entryContext,
  });
  if (!answer) return navigationChips;

  // Ограничиваем длину ответа, чтобы не раздувать промпт.
  const answerForPrompt = answer.slice(0, 300);
  const dialogContext = buildDialogContext(params.messages);
  const textChipLimit = Math.max(0, MAX_CHIPS - navigationChips.length);

  if (textChipLimit <= 0) {
    return navigationChips.slice(0, MAX_CHIPS);
  }

  let textChips: SuggestedChip[] = [];
  try {
    textChips = await requestChipsFromModel({
      dialogContext,
      assistantAnswer: answerForPrompt,
      maxChips: textChipLimit,
      onboardingReasons: params.onboardingReasons,
      userId: params.userId,
      sessionId: params.sessionId,
    });
  } catch (error) {
    console.error('[SuggestedChips] Failed to generate chips:', error);
    return [];
  }

  return [...navigationChips, ...textChips].slice(0, MAX_CHIPS);
}
