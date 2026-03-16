import { z } from 'zod';

export const ASSISTANT_TONE_VALUES = [
  'gentle',
  'balanced',
  'uplifting',
  'direct',
] as const;

export const ASSISTANT_TONE_WITH_UNKNOWN_VALUES = [
  'gentle',
  'balanced',
  'uplifting',
  'direct',
  'unknown',
] as const;

export const AssistantToneEnum = z.enum(ASSISTANT_TONE_VALUES);
export const AssistantToneWithUnknownEnum = z.enum(
  ASSISTANT_TONE_WITH_UNKNOWN_VALUES
);

export type AssistantTone = z.infer<typeof AssistantToneEnum>;
export type AssistantToneWithUnknown = z.infer<
  typeof AssistantToneWithUnknownEnum
>;

export const DEFAULT_ASSISTANT_TONE: AssistantTone = 'balanced';
export const UNKNOWN_ASSISTANT_TONE: AssistantToneWithUnknown = 'unknown';

export interface AssistantToneMeta {
  value: AssistantTone;
  label: string;
  description: string;
}

export const ASSISTANT_TONE_META: Record<AssistantTone, AssistantToneMeta> = {
  gentle: {
    value: 'gentle',
    label: 'Мягкий',
    description: 'Слушаю, поддерживаю и говорю очень бережно',
  },
  balanced: {
    value: 'balanced',
    label: 'Спокойный',
    description: 'Поддерживаю диалог и помогаю разобраться',
  },
  uplifting: {
    value: 'uplifting',
    label: 'Воодушевляющий',
    description: 'Поддерживаю и мотивирую двигаться дальше',
  },
  direct: {
    value: 'direct',
    label: 'Прямой',
    description: 'Говорю честно и помогаю сфокусироваться на действиях',
  },
};

export const ASSISTANT_TONE_OPTIONS = ASSISTANT_TONE_VALUES.map((value) => ({
  value,
  label: ASSISTANT_TONE_META[value].label,
}));

export function isAssistantTone(value: unknown): value is AssistantTone {
  return (
    typeof value === 'string' &&
    ASSISTANT_TONE_VALUES.includes(value as AssistantTone)
  );
}

export function isAssistantToneWithUnknown(
  value: unknown
): value is AssistantToneWithUnknown {
  return (
    typeof value === 'string' &&
    ASSISTANT_TONE_WITH_UNKNOWN_VALUES.includes(
      value as AssistantToneWithUnknown
    )
  );
}

export function resolveAssistantTone(
  value?: string | null,
  fallback: AssistantTone = DEFAULT_ASSISTANT_TONE
): AssistantTone {
  if (isAssistantTone(value)) {
    return value;
  }

  return fallback;
}

export function getAssistantToneMeta(
  value?: string | null,
  fallback: AssistantTone = DEFAULT_ASSISTANT_TONE
): AssistantToneMeta {
  const tone = resolveAssistantTone(value, fallback);
  return ASSISTANT_TONE_META[tone];
}

export function getAssistantToneLabel(
  value?: string | null,
  fallback: AssistantTone = DEFAULT_ASSISTANT_TONE
): string {
  return getAssistantToneMeta(value, fallback).label;
}

export function getAssistantToneDescription(
  value?: string | null,
  fallback: AssistantTone = DEFAULT_ASSISTANT_TONE
): string {
  return getAssistantToneMeta(value, fallback).description;
}
