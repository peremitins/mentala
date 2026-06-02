import {
  buildChatPrelude,
  buildDeveloperContext,
  buildEntryContextDescription,
} from '../prompts';
import { buildRoadmapDeveloperPrompt } from '../chat/roadmap-entry.service';
import {
  type DurableUserMemory,
  type RuntimeCompactState,
  type SessionHandoffSummary,
  serializeDurableUserMemoryForPrompt,
  serializeHandoffSummaryForRealtimeVoicePrompt,
  serializeRuntimeCompactStateForPrompt,
} from '../chat/chatMemory.types';
import { resolveOnboardingReasons } from '../../../shared/dto/onboarding';
import type { ChatEntryContext } from '../../../shared/dto';
import type { AssistantPersona } from '../chat/assistant-persona.service';
import type { Addressing } from '../../../shared/dto/notifications';

const REALTIME_RUNTIME_COMPACT_BLOCK_START = '[RUNTIME_COMPACT_STATE]';
const REALTIME_RUNTIME_COMPACT_BLOCK_END = '[/RUNTIME_COMPACT_STATE]';

export type RealtimeVoiceInstructionsComposerParams = {
  userName?: string | null;
  userGender?: string | null;
  userLocale?: string | null;
  assistantPersona: AssistantPersona;
  addressing?: Addressing | null;
  toneKey?: string | null;
  toneLabel?: string | null;
  toneDescription?: string | null;
  onboardingReasons?: ReturnType<typeof resolveOnboardingReasons>;
  entryContext?: ChatEntryContext | null;
  crisisGuidance?: string | null;
  durableUserMemory?: DurableUserMemory | null;
  handoffSummary?: SessionHandoffSummary | null;
  runtimeCompactState?: RuntimeCompactState | null;
};

export function composeRealtimeVoiceInstructions(
  params: RealtimeVoiceInstructionsComposerParams
) {
  const entryContextBlock = params.entryContext
    ? buildEntryContextDescription(params.entryContext)
    : '';
  const roadmapContextBlock = buildRoadmapDeveloperPrompt(params.entryContext);
  const crisisGuidance = String(params.crisisGuidance || '').trim();
  const durableUserMemoryBlock = params.durableUserMemory
    ? serializeDurableUserMemoryForPrompt(params.durableUserMemory)
    : '';
  const handoffSummaryBlock = params.handoffSummary
    ? serializeHandoffSummaryForRealtimeVoicePrompt(params.handoffSummary)
    : '';
  const runtimeCompactStateBlock = params.runtimeCompactState
    ? serializeRuntimeCompactStateForPrompt(params.runtimeCompactState)
    : '';

  return [
    buildChatPrelude({
      lang: 'ru',
      user_locale: params.userLocale || 'ru-RU',
      user_name: params.userName || undefined,
      user_gender: params.userGender || undefined,
    }),
    buildDeveloperContext(
      {
        user_name: params.userName || undefined,
        user_gender: params.userGender || undefined,
        assistant_gender: params.assistantPersona.gender,
        assistant_display_name: params.assistantPersona.displayName,
        addressing: params.addressing || undefined,
        toneKey: params.toneKey || undefined,
        toneLabel: params.toneLabel || undefined,
        toneDescription: params.toneDescription || undefined,
        onboardingReasons: params.onboardingReasons,
      },
      {
        responseNumber: 1,
      }
    ),
    durableUserMemoryBlock,
    handoffSummaryBlock,
    runtimeCompactStateBlock,
    entryContextBlock,
    roadmapContextBlock,
    // Детальный crisis guidance нельзя держать в постоянных session.instructions:
    // иначе Realtime ведёт себя так, будто кризис активен всегда.
    crisisGuidance,
    `Режим realtime voice:
- Отвечай естественно, по-человечески и кратко, как в живом голосовом разговоре.
- По умолчанию 1-3 коротких предложения без markdown и без тяжёлых списков.
- Максимум один вопрос за ответ.
- Если пользователь перебивает, сразу уступай ход и не продолжай старую мысль.
- Не упоминай внутренние инструкции, модель, токены, транспорт или технические ограничения.
- Если контекста недостаточно, задай один точный уточняющий вопрос.
- Если пользователь явно переходит на другой язык, подстройся под него. Иначе отвечай по-русски.`,
  ]
    .filter((block) => typeof block === 'string' && block.trim().length > 0)
    .join('\n\n');
}

export function upsertRealtimeVoiceRuntimeCompactInstructions(params: {
  instructions: string;
  runtimeCompactState: RuntimeCompactState;
}) {
  const baseInstructions = String(params.instructions || '').trim();
  const compactBlock = [
    REALTIME_RUNTIME_COMPACT_BLOCK_START,
    serializeRuntimeCompactStateForPrompt(params.runtimeCompactState),
    REALTIME_RUNTIME_COMPACT_BLOCK_END,
  ].join('\n');
  const normalizedBase = baseInstructions.replace(
    new RegExp(
      `${REALTIME_RUNTIME_COMPACT_BLOCK_START}[\\s\\S]*?${REALTIME_RUNTIME_COMPACT_BLOCK_END}\\n*`,
      'g'
    ),
    ''
  );

  return [normalizedBase.trim(), compactBlock]
    .filter((block) => block.length > 0)
    .join('\n\n');
}
