import {
  buildChatPrelude,
  buildDeveloperContext,
  buildEntryContextDescription,
} from '../prompts';
import { resolveOnboardingReasons } from '../../../shared/dto/onboarding';
import type { ChatEntryContext } from '../../../shared/dto';
import type { AssistantPersona } from '../chat/assistant-persona.service';
import type { Addressing } from '../../../shared/dto/notifications';

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
};

export function composeRealtimeVoiceInstructions(
  params: RealtimeVoiceInstructionsComposerParams
) {
  const entryContextBlock = params.entryContext
    ? buildEntryContextDescription(params.entryContext)
    : '';
  const crisisGuidance = String(params.crisisGuidance || '').trim();

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
    entryContextBlock,
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
