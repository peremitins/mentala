import type {
  Addressing,
  Directness,
  NotificationKind,
  NotificationSubtype,
  Tone,
} from '../../../shared/dto/notifications';
import { computeGenerationConfigHash } from '../../utils/notification-ai-config-hash';

type BuildAiTextConfigHashCandidatesParams = {
  kind: NotificationKind;
  isCustomEntity: boolean;
  entityKey?: string | null;
  entityName: string;
  entityDescription?: string | null;
  tone: Tone;
  addressing: Addressing;
  directness: Directness;
  subtype: NotificationSubtype | null;
  habitIntent?: 'quit' | 'build' | null;
  userGender?: 'male' | 'female' | null;
  customPromptNotification?: string | null;
};

function buildBaseHash(params: {
  entityName: string;
  entityDescription?: string | null;
  tone: Tone;
  addressing: Addressing;
  directness: Directness;
  subtype: NotificationSubtype | null;
  kind: NotificationKind;
  habitIntent?: 'quit' | 'build' | null;
  userGender?: 'male' | 'female' | null;
  customPromptNotification?: string | null;
}): string {
  return computeGenerationConfigHash({
    entityName: params.entityName,
    entityDescription: params.entityDescription || null,
    tone: params.tone,
    addressing: params.addressing,
    directness: params.directness,
    subtype: params.subtype,
    textSource: 'ai',
    kind: params.kind,
    habitIntent: params.kind === 'habits' ? (params.habitIntent ?? null) : null,
    userGender: params.userGender ?? null,
    customPromptNotification: params.customPromptNotification ?? null,
  });
}

export function buildAiTextConfigHashCandidates(
  params: BuildAiTextConfigHashCandidatesParams
): string[] {
  const primaryHash = buildBaseHash({
    entityName: params.entityName,
    entityDescription: params.entityDescription,
    tone: params.tone,
    addressing: params.addressing,
    directness: params.directness,
    subtype: params.subtype,
    kind: params.kind,
    habitIntent: params.habitIntent,
    userGender: params.userGender,
    customPromptNotification: params.customPromptNotification,
  });

  const hashes = [primaryHash];

  // Для старых шаблонных therapy-тем сохраняем fallback на legacy-хеш,
  // где в расчёт шёл сырой entityKey без описания. Это нужно, чтобы
  // оркестратор продолжал видеть уже сгенерированные старые AI-пулы.
  if (params.kind === 'therapy' && !params.isCustomEntity && params.entityKey) {
    const legacyHash = buildBaseHash({
      entityName: params.entityKey,
      entityDescription: null,
      tone: params.tone,
      addressing: params.addressing,
      directness: params.directness,
      subtype: params.subtype,
      kind: params.kind,
      userGender: params.userGender,
      customPromptNotification: params.customPromptNotification,
    });

    if (legacyHash !== primaryHash) {
      hashes.push(legacyHash);
    }
  }

  return hashes;
}
