import { describe, expect, it } from 'vitest';
import {
  PHOBIAS_CONFINED_SPACES_LABEL,
  PHOBIAS_HEIGHTS_LABEL,
  PHOBIAS_OTHER_TOPIC_LABEL,
  PHOBIAS_PUBLIC_SPEAKING_LABEL,
  PHOBIAS_RESUME_LABEL,
  PHOBIAS_SOCIAL_FEAR_LABEL,
  buildPhobiasDeveloperPrompt,
  buildStaticPhobiasSuggestedChips,
  getValidLastTherapyFocus,
  resolveLastTherapyFocusUpdate,
  resolvePhobiasConversationState,
} from '../server/application/chat/phobias-entry.service';

const PHOBIAS_ENTRY_CONTEXT = {
  type: 'therapy_topic' as const,
  topic_id: 'phobias',
  topic_name: 'Страхи',
};

const VALID_NOW = new Date('2026-03-09T12:00:00.000Z');

function createLastFocus(updatedAt = '2026-03-05T12:00:00.000Z') {
  return {
    topicId: 'phobias' as const,
    subtopicKey: 'public_speaking' as const,
    subtopicLabel: PHOBIAS_PUBLIC_SPEAKING_LABEL,
    confirmedByUser: true as const,
    updatedAt,
  };
}

describe('phobias entry service', () => {
  it('показывает welcome-selector без сохранённого фокуса', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [],
      lastTherapyFocus: null,
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('welcome_selector');
    expect(
      buildStaticPhobiasSuggestedChips(state)?.map((chip) => chip.text)
    ).toEqual([
      PHOBIAS_PUBLIC_SPEAKING_LABEL,
      PHOBIAS_HEIGHTS_LABEL,
      PHOBIAS_CONFINED_SPACES_LABEL,
      PHOBIAS_SOCIAL_FEAR_LABEL,
      PHOBIAS_OTHER_TOPIC_LABEL,
    ]);
  });

  it('показывает сценарий продолжения при валидном lastTherapyFocus', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [],
      lastTherapyFocus: createLastFocus(),
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('welcome_resume_selector');
    expect(state?.validLastTherapyFocus?.subtopicLabel).toBe(
      PHOBIAS_PUBLIC_SPEAKING_LABEL
    );
    expect(
      buildStaticPhobiasSuggestedChips(state)?.map((chip) => chip.text)
    ).toEqual([PHOBIAS_RESUME_LABEL, PHOBIAS_OTHER_TOPIC_LABEL]);
  });

  it('игнорирует lastTherapyFocus старше 30 дней', () => {
    const expiredFocus = createLastFocus('2026-01-05T12:00:00.000Z');

    expect(getValidLastTherapyFocus(expiredFocus, VALID_NOW)).toBeNull();

    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [],
      lastTherapyFocus: expiredFocus,
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('welcome_selector');
    expect(state?.validLastTherapyFocus).toBeNull();
  });

  it('детектирует явный выбор каталожной подтемы через chip', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [{ role: 'user', content: PHOBIAS_HEIGHTS_LABEL }],
      lastTherapyFocus: createLastFocus(),
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('selected_focus');
    expect(state?.selectedFocus?.subtopicKey).toBe('heights');

    const update = resolveLastTherapyFocusUpdate({ state, now: VALID_NOW });
    expect(update?.action).toBe('selected');
    expect(update?.changed).toBe(true);
    expect(update?.nextFocus.subtopicLabel).toBe(PHOBIAS_HEIGHTS_LABEL);
  });

  it('детектирует продолжение прошлой подтемы', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [{ role: 'user', content: PHOBIAS_RESUME_LABEL }],
      lastTherapyFocus: createLastFocus(),
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('resume_focus');
    expect(state?.selectedFocus?.subtopicKey).toBe('public_speaking');

    const update = resolveLastTherapyFocusUpdate({ state, now: VALID_NOW });
    expect(update?.action).toBe('resumed');
    expect(update?.changed).toBe(false);
  });

  it('возвращает пользователя к базовому списку после выбора другой темы', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [{ role: 'user', content: PHOBIAS_OTHER_TOPIC_LABEL }],
      lastTherapyFocus: createLastFocus(),
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('return_to_selector');
    expect(
      buildStaticPhobiasSuggestedChips(state)?.map((chip) => chip.text)
    ).toEqual([
      PHOBIAS_PUBLIC_SPEAKING_LABEL,
      PHOBIAS_HEIGHTS_LABEL,
      PHOBIAS_CONFINED_SPACES_LABEL,
      PHOBIAS_SOCIAL_FEAR_LABEL,
      PHOBIAS_OTHER_TOPIC_LABEL,
    ]);
  });

  it('сохраняет другой конкретный страх после короткого ответа на selector', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [
        {
          role: 'assistant',
          content:
            'Можно начать со страха публичных выступлений, страха высоты, страха замкнутых пространств или социального страха. Что ближе?',
        },
        { role: 'user', content: 'Пауки' },
      ],
      lastTherapyFocus: null,
      now: VALID_NOW,
    });

    expect(state?.mode).toBe('selected_focus');
    expect(state?.selectedFocus?.subtopicKey).toBe('other_specific');
    expect(state?.selectedFocus?.subtopicLabel).toBe('Пауки');
  });

  it('добавляет отдельный developer prompt для сценария страхов', () => {
    const state = resolvePhobiasConversationState({
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      messages: [],
      lastTherapyFocus: null,
      now: VALID_NOW,
    });

    const prompt = buildPhobiasDeveloperPrompt(state);

    expect(prompt).toContain('SPECIAL CASE');
    expect(prompt).toContain(PHOBIAS_PUBLIC_SPEAKING_LABEL);
    expect(prompt).toContain('3-5 популярных категорий страхов');
  });
});
