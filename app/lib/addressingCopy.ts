import type { Addressing } from '@/shared/dto/notifications';
import {
  pickAddressingText,
  type AddressingText,
} from '@/shared/utils/addressing';

const ADDRESSING_COPY = {
  chatInputPlaceholder: {
    informal: 'Напиши сообщение…',
    formal: 'Напишите сообщение…',
  },
  chatFeedbackReasonDescription: {
    informal: 'Выбери причину и при необходимости добавь комментарий.',
    formal: 'Выберите причину и при необходимости добавьте комментарий.',
  },
  chatFeedbackReasonPlaceholder: {
    informal: 'Выбери причину (необязательно)',
    formal: 'Выберите причину (необязательно)',
  },
  chatFeedbackCommentPlaceholder: {
    informal: 'Опиши, что было не так (необязательно)',
    formal: 'Опишите, что было не так (необязательно)',
  },
  chatRetryHint: {
    informal: 'Начни новый диалог и попробуй снова',
    formal: 'Начните новый диалог и попробуйте снова',
  },
  realtimeReadyHint: {
    informal: 'Я на связи. Можно говорить, я слушаю.',
    formal: 'Я на связи. Можно говорить, я слушаю.',
  },
  habitsPageDescription: {
    informal:
      'Выбери привычку, которую хочешь приобрести или оставить в прошлом. <br />\nМы поможем через разговор, практики и напоминания, которые можно настроить под себя.',
    formal:
      'Выберите привычку, которую хотите приобрести или оставить в прошлом. <br />\nМы поможем через разговор, практики и напоминания, которые можно настроить под себя.',
  },
  habitsCreateCardDescription: {
    informal: 'Настрой свои напоминания под себя: название, текст и частоту',
    formal: 'Настройте напоминания под себя: название, текст и частоту',
  },
  therapyPageDescription: {
    informal:
      'Выбери тему, которая сейчас волнует. <br />\nМы поможем через разговор, практики и напоминания, которые можно настроить под себя.',
    formal:
      'Выберите тему, которая сейчас волнует. <br />\nМы поможем через разговор, практики и напоминания, которые можно настроить под себя.',
  },
  therapyDetailDescription: {
    informal: 'Выбери фокус и получай поддержку, когда тебе нужна опора.',
    formal: 'Выберите фокус и получайте поддержку, когда вам нужна опора.',
  },
  therapyCreateCardDescription: {
    informal: 'Сформулируй свой запрос и настрой тексты под себя',
    formal: 'Сформулируйте свой запрос и настройте тексты под себя',
  },
  customHabitSubtitle: {
    informal: 'Настрой свою привычку: выбери цель, добавь описание и сохрани',
    formal:
      'Настройте свою привычку: выберите цель, добавьте описание и сохраните',
  },
  customTherapySubtitle: {
    informal: 'Создай тему под свои запросы: название, описание и эмодзи',
    formal: 'Создайте тему под свои запросы: название, описание и эмодзи',
  },
  customEntityDescriptionPlaceholder: {
    informal:
      'Опиши чуть подробнее. Так ИИ сможет создавать более точные и полезные уведомления.',
    formal:
      'Опишите чуть подробнее. Так ИИ сможет создавать более точные и полезные уведомления.',
  },
} as const satisfies Record<string, AddressingText<string>>;

export type AddressingCopyKey = keyof typeof ADDRESSING_COPY;

export function getAddressingCopy(
  key: AddressingCopyKey,
  addressing?: Addressing
): string {
  return pickAddressingText(addressing, ADDRESSING_COPY[key]);
}

export const GRATITUDE_DIARY_ADDRESSING_COPY = {
  DEFAULT_PROMPT: {
    informal: 'Что сегодня поддержало тебя?',
    formal: 'Что сегодня поддержало вас?',
  },
  EMPTY: {
    informal: 'Пока нет записей. Начни с одной короткой благодарности.',
    formal: 'Пока нет записей. Начните с одной короткой благодарности.',
  },
  PROMPTS_SUBTITLE: {
    informal: 'Выбери вопрос, чтобы быстрее начать запись',
    formal: 'Выберите вопрос, чтобы быстрее начать запись',
  },
  PROMPTS_CREATE_FAVORITE_PLACEHOLDER: {
    informal: 'Например: Что сегодня согрело тебя?',
    formal: 'Например: Что сегодня согрело вас?',
  },
  PROMPTS_EMPTY_FAVORITES: {
    informal:
      'В избранном пока пусто. Добавь свои вопросы или сохрани понравившиеся из тем.',
    formal:
      'В избранном пока пусто. Добавьте свои вопросы или сохраните понравившиеся из тем.',
  },
  TAG_PLACEHOLDER: {
    informal: 'Добавь тег (например, семья)',
    formal: 'Добавьте тег (например, семья)',
  },
  SELECT_MOOD: {
    informal: 'Как ты себя чувствуешь?',
    formal: 'Как вы себя чувствуете?',
  },
  VOICE_FALLBACK: {
    informal: 'Продолжай ввод вручную.',
    formal: 'Продолжайте ввод вручную.',
  },
} as const satisfies Record<string, AddressingText<string>>;

export type GratitudeDiaryAddressingCopyKey =
  keyof typeof GRATITUDE_DIARY_ADDRESSING_COPY;

export function getGratitudeDiaryAddressingCopy(
  key: GratitudeDiaryAddressingCopyKey,
  addressing?: Addressing
): string {
  return pickAddressingText(addressing, GRATITUDE_DIARY_ADDRESSING_COPY[key]);
}
