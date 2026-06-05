import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/infrastructure/db/client', () => ({
  db: {},
}));

vi.mock('@/server/application/llm.service', () => ({
  chatWithFallback: vi.fn(),
}));

vi.mock('@/server/application/garden/garden-metrics.service', () => ({
  collectProgramMetricsLightweight: vi.fn(),
}));

describe('garden summary structured form values', () => {
  it('превращает choice-id из structured_form в человекочитаемые названия', async () => {
    const { formatStructuredFormFieldValueForReport } = await import(
      '../server/application/garden/garden-summary.service'
    );

    const field = {
      id: 'helped_techniques',
      options: [
        { id: 'grounding_5_4_3_2_1', label: 'Заземление 5-4-3-2-1' },
        { id: 'stop_pause', label: 'СТОП-пауза' },
        { id: 'ai_chat', label: 'Чат с ассистентом' },
      ],
    };

    expect(
      formatStructuredFormFieldValueForReport(
        ['grounding_5_4_3_2_1', 'ai_chat'],
        field
      )
    ).toBe('Заземление 5-4-3-2-1, Чат с ассистентом');
    expect(formatStructuredFormFieldValueForReport('ai_chat', field)).toBe(
      'Чат с ассистентом'
    );
    expect(formatStructuredFormFieldValueForReport('stop_pause', field)).toBe(
      'СТОП-пауза'
    );
  });

  it('форматирует несколько выбранных изменений weekly_check для отчёта', async () => {
    const { formatWeeklyMainChangeForReport } = await import(
      '../server/application/garden/garden-summary.service'
    );

    expect(
      formatWeeklyMainChangeForReport([
        'less_body_tension',
        'more_pause',
        'less_avoidance',
      ])
    ).toBe(
      'меньше напряжения в теле, чаще получается делать паузу, меньше избегает'
    );
    expect(formatWeeklyMainChangeForReport('worse')).toBe('стало тяжелее');
  });

  it('форматирует связанные с садом результаты опросников для финального отчёта', async () => {
    const { formatAssessmentResultsForPrompt } = await import(
      '../server/application/garden/garden-summary.service'
    );

    expect(
      formatAssessmentResultsForPrompt([
        {
          slug: 'anxiety_check_v1',
          source: 'program_baseline',
          score: 12,
          bandId: 'moderate',
          title: 'Тревога сейчас заметна',
          shortText: 'Ответы показывают, что тревога может занимать внимание.',
          scoreDirection: 'higher_is_worse',
          completedAt: '2026-06-03T10:00:00.000Z',
        },
        {
          slug: 'anxiety_check_v1',
          source: 'program_final',
          score: 6,
          bandId: 'mild',
          title: 'Тревога иногда заметна',
          shortText: 'Ответы стали менее тревожными.',
          scoreDirection: 'higher_is_worse',
          completedAt: '2026-06-20T10:00:00.000Z',
        },
      ])
    ).toContain('финальный замер сада (anxiety_check_v1');
  });
});
