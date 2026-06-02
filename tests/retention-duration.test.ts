import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/application/garden/garden-summary.service', () => ({
  getOrGeneratePlantSummary: vi.fn(),
}));

describe('retention duration estimation', () => {
  it('считает длительность roadmap-шага по actions, а не по старому текстовому полю', async () => {
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const estimate = mod.estimateProgramStepActionsDurationSeconds;

    const withoutWeeklyCheck = estimate(
      [
        {
          id: 'step-14-breathing',
          type: 'breathing',
          title: 'Дыхание',
          durationSeconds: 240,
          completionDelaySeconds: 240,
          required: true,
        },
        {
          id: 'step-14-chat',
          type: 'ai_chat_session',
          title: 'Разбор с ассистентом',
          minDurationSec: 180,
          minQualifyingMessages: 3,
          required: true,
        },
        {
          id: 'step-14-form',
          type: 'structured_form',
          title: 'Карточка прогноза',
          formKind: 'thought_record',
          fields: [
            { id: 'prediction', label: 'Пугающий прогноз', maxLength: 250 },
            { id: 'facts_for', label: 'Факты за', maxLength: 500 },
            { id: 'facts_against', label: 'Факты против', maxLength: 500 },
          ],
          required: true,
        },
      ],
      ['Катастрофизация', 'Проверяем прогноз без спора с собой']
    );

    const withWeeklyCheck = estimate([
      {
        id: 'step-14-weekly-check',
        type: 'weekly_check',
        title: 'Короткая проверка',
        questions: [
          {
            id: 'anxiety_level_last_days',
            type: 'rating_scale',
            question: 'Насколько тревога мешала тебе в последние дни?',
            min: 0,
            max: 10,
          },
          {
            id: 'main_change',
            type: 'choice',
            question: 'Что стало заметнее за это время?',
            mode: 'single',
            options: [
              { id: 'less_body_tension', label: 'Меньше напряжения в теле' },
              { id: 'worse', label: 'Стало тяжелее' },
            ],
          },
        ],
        required: false,
      },
    ]);

    expect(withoutWeeklyCheck).toBeGreaterThanOrEqual(600);
    expect(withWeeklyCheck).toBeGreaterThanOrEqual(120);
    expect(withoutWeeklyCheck + withWeeklyCheck).toBeGreaterThanOrEqual(720);
  });
});
