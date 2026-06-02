import { describe, expect, it } from 'vitest';
import {
  MoodCheckinRequestDto,
  ProgramStepActionDto,
  ProgramStepDto,
  ProgramStepStartRequestDto,
  StreakHistoryResponseDto,
  StreakSummaryDto,
  ThoughtCollectionResponseDto,
  ThoughtOfTheDaySaveResponseDto,
  TodayResponseDto,
} from '../shared/dto/retention';

describe('retention dto', () => {
  it('ставит home как источник mood check-in по умолчанию', () => {
    const parsed = MoodCheckinRequestDto.parse({
      mood: 'good',
    });

    expect(parsed).toEqual({
      mood: 'good',
      source: 'home',
    });
  });

  it('валидирует replay-запуск шага программы', () => {
    expect(ProgramStepStartRequestDto.parse({})).toEqual({ replay: false });
    expect(ProgramStepStartRequestDto.parse({ replay: true })).toEqual({
      replay: true,
    });
  });

  it('валидирует embedded action-типы программы', () => {
    expect(
      ProgramStepActionDto.parse({
        id: 'step-5-grounding',
        type: 'quick_help_grounding',
        title: 'Заземление 5-4-3-2-1',
        required: true,
      }).type
    ).toBe('quick_help_grounding');

    expect(
      ProgramStepActionDto.parse({
        id: 'step-24-meditation',
        type: 'meditation',
        title: 'Медитация на опору',
        template: 'anxiety',
        targetId: 'steady-breath',
        durationSeconds: 180,
        completionDelaySeconds: 180,
        required: true,
      }).completionDelaySeconds
    ).toBe(180);

    expect(
      ProgramStepActionDto.parse({
        id: 'step-24-journal',
        type: 'journal_entry',
        title: 'Запись',
        completionDelaySeconds: null,
        required: true,
      }).completionDelaySeconds
    ).toBeNull();
  });

  it('валидирует v5 action-типы программы', () => {
    const structuredForm = ProgramStepActionDto.parse({
      id: 'step-12-thought-record',
      type: 'structured_form',
      title: 'Карточка мысли',
      formKind: 'thought_record',
      required: true,
      fields: [
        {
          id: 'situation',
          label: 'Ситуация',
          placeholder: 'Что произошло?',
          maxLength: 250,
        },
        {
          id: 'belief',
          label: 'Насколько мысль кажется правдой?',
          type: 'rating_scale',
          min: 0,
          max: 10,
        },
        {
          id: 'done_status',
          label: 'Что получилось с экспериментом?',
          type: 'experiment_status',
          mode: 'single',
        },
      ],
    });
    expect(structuredForm.fields?.[0]?.type).toBe('textarea');
    expect(structuredForm.formKind).toBe('thought_record');
    expect(structuredForm.fields?.[2]?.type).toBe('experiment_status');

    const guidedSteps = ProgramStepActionDto.parse({
      id: 'step-8-stop',
      type: 'guided_steps',
      title: 'Пауза «Стоп»',
      steps: [
        { id: 'stop', title: 'Остановись' },
        { id: 'breathe', title: 'Сделай спокойный выдох' },
      ],
    });
    expect(guidedSteps.steps).toHaveLength(2);

    const stepIntro = ProgramStepActionDto.parse({
      id: 'step-1-intro',
      type: 'guided_steps',
      title: 'Коротко перед шагом',
      formKind: 'step_intro',
      prompt: 'Короткий вводный текст перед первым вопросом.',
      required: false,
      steps: [
        {
          id: 'article-1',
          title: 'Что будет в этом шаге',
          text: 'Компактная мини-статья без чекбоксов.',
          required: false,
        },
      ],
    });
    expect(stepIntro.formKind).toBe('step_intro');
    expect(stepIntro.required).toBe(false);

    const weeklyCheck = ProgramStepActionDto.parse({
      id: 'step-7-weekly-check',
      type: 'weekly_check',
      title: 'Короткая проверка',
      placement: 'after_completion',
      required: false,
      questions: [
        {
          id: 'anxiety_level_last_days',
          type: 'rating_scale',
          question: 'Насколько тревога мешала тебе в последние дни?',
          min: 0,
          max: 10,
        },
        {
          id: 'support_need',
          type: 'choice',
          question: 'Как идут дела на этой неделе?',
          mode: 'single',
          options: [
            { id: 'better', label: 'Лучше, чем раньше' },
            { id: 'harder', label: 'Тяжелее, чем хотелось бы' },
          ],
        },
      ],
    });
    expect(weeklyCheck.placement).toBe('after_completion');
    expect(weeklyCheck.questions?.[1]?.options?.[1]?.id).toBe('harder');
  });

  it('валидирует optional intro и miniArticle у шага программы', () => {
    const parsed = ProgramStepDto.parse({
      id: 1,
      step: 1,
      chapter: 1,
      title: 'Начинаем спокойно',
      subtitle: 'Понимаем маршрут',
      nextHint: 'Дальше — проверка состояния',
      introText: 'Добро пожаловать в сад «Спокойствие».',
      miniArticle: {
        title: 'Что будет в этом саду',
        body: 'Короткая мини-статья перед первым действием.',
        sourceNotes: ['Mentala internal safety rules.'],
        readingLevel: 'simple',
      },
      durationMin: 8,
      durationLabel: '5-10 минут',
      energyReward: 5,
      actions: [],
      status: 'active',
      completedAt: null,
    });

    expect(parsed.introText).toContain('Добро пожаловать');
    expect(parsed.miniArticle?.readingLevel).toBe('simple');
  });

  it('валидирует сохранение и коллекцию мыслей дня', () => {
    const saveResponse = ThoughtOfTheDaySaveResponseDto.parse({
      item: {
        id: 12,
        entryDate: '2026-05-14',
        text: 'Сегодня достаточно одного маленького шага.',
        source: 'fallback',
        saved: true,
      },
      rewardGranted: true,
      energyToday: 6,
      energyWeekly: 18,
    });

    expect(saveResponse.item.saved).toBe(true);

    const collection = ThoughtCollectionResponseDto.parse({
      items: [
        {
          id: 12,
          entryDate: '2026-05-14',
          text: 'Сегодня достаточно одного маленького шага.',
          source: 'fallback',
          saved: true,
          savedAt: '2026-05-14T08:00:00.000Z',
        },
      ],
    });

    expect(collection.items[0]?.id).toBe(12);
  });

  it('валидирует today payload с повторяемым пройденным шагом', () => {
    const parsed = TodayResponseDto.parse({
      timezone: 'Europe/Moscow',
      entryDate: '2026-05-13',
      mood: null,
      streak: {
        current: 2,
        best: 4,
        week: [false, false, true, true, false, false, false],
      },
      energy: {
        today: 5,
        weekly: 12,
        weeklyGoal: 25,
      },
      program: {
        id: 1,
        slug: 'calm_anxiety_30',
        title: 'Спокойствие',
        subtitle: '30 шагов для мягкой работы с тревогой',
        totalSteps: 30,
        currentStep: 2,
        completedSteps: 1,
        progressPercent: 3,
        currentStepItem: {
          id: 2,
          step: 2,
          chapter: 1,
          title: 'Что такое тревога',
          subtitle: 'Отделяем сигнал тревоги от факта опасности.',
          nextHint: 'Дальше — техника наблюдения.',
          durationMin: 4,
          energyReward: 5,
          status: 'active',
          completedAt: null,
          actions: [
            {
              id: 'step-2-mood',
              type: 'mood_checkin',
              title: 'Как ты себя чувствуешь?',
              required: true,
            },
          ],
        },
        chapters: [
          {
            chapter: 1,
            title: 'Знакомство',
            stepRange: 'Шаги 1-3',
            accent: 'teal',
            steps: [
              {
                id: 1,
                step: 1,
                chapter: 1,
                title: 'Первый шаг',
                subtitle: 'Коротко замечаем, с чем ты пришёл.',
                nextHint: 'Дальше — первое дыхание.',
                durationMin: 3,
                energyReward: 5,
                status: 'completed',
                completedAt: '2026-05-13T08:00:00.000Z',
                actions: [],
              },
            ],
          },
        ],
      },
      thought: {
        id: null,
        entryDate: '2026-05-13',
        text: 'Эмоция — это не факт о тебе.',
        source: 'fallback',
        saved: false,
      },
    });

    expect(parsed.program.chapters[0]?.steps[0]?.status).toBe('completed');
  });

  it('сохраняет backward-compatible streak shape и принимает новые поля', () => {
    expect(
      TodayResponseDto.parse({
        timezone: 'Europe/Moscow',
        entryDate: '2026-05-13',
        mood: null,
        streak: {
          current: 2,
          best: 4,
          week: [false, false, true, true, false, false, false],
        },
        energy: {
          today: 5,
          weekly: 12,
          weeklyGoal: 25,
        },
        program: {
          id: 1,
          slug: 'calm_anxiety_30',
          title: 'Спокойствие',
          subtitle: '30 шагов для мягкой работы с тревогой',
          totalSteps: 30,
          currentStep: 2,
          completedSteps: 1,
          progressPercent: 3,
          currentStepItem: null,
          chapters: [],
        },
        thought: {
          id: null,
          entryDate: '2026-05-13',
          text: 'Эмоция — это не факт о тебе.',
          source: 'fallback',
          saved: false,
        },
      }).streak.current
    ).toBe(2);

    const summary = StreakSummaryDto.parse({
      current: 12,
      best: 18,
      week: [true, true, false, true, true, false, true],
      status: 'active',
      repair: {
        limit: 2,
        used: 1,
        remaining: 1,
        period: '2026-05',
      },
      pausedSince: null,
      notice: {
        type: 'repaired',
        title: 'Серия сохранена',
        text: 'Мы мягко восстановили один пропущенный день.',
      },
      weekDetails: [
        { date: '2026-05-07', status: 'active', active: true },
        { date: '2026-05-08', status: 'repaired', active: false },
        { date: '2026-05-09', status: 'active', active: true },
        { date: '2026-05-10', status: 'missed', active: false },
        { date: '2026-05-11', status: 'active', active: true },
        { date: '2026-05-12', status: 'missed', active: false },
        { date: '2026-05-13', status: 'today', active: true },
      ],
    });

    expect(summary.repair.remaining).toBe(1);
    expect(summary.weekDetails?.[1]?.status).toBe('repaired');
  });

  it('валидирует историю streak для отдельного экрана', () => {
    const parsed = StreakHistoryResponseDto.parse({
      summary: {
        current: 12,
        best: 18,
        week: [true, true, false, true, true, false, true],
        status: 'paused',
        repair: {
          limit: 2,
          used: 2,
          remaining: 0,
          period: '2026-05',
        },
        pausedSince: '2026-05-20',
        notice: null,
      },
      calendarDays: [
        { date: '2026-05-19', status: 'active', active: true },
        { date: '2026-05-20', status: 'paused', active: false },
      ],
      events: [
        {
          id: 1,
          type: 'paused_auto',
          eventDate: '2026-05-20',
          createdAt: '2026-05-20T08:00:00.000Z',
          metadata: { missedDays: 3 },
        },
      ],
    });

    expect(parsed.summary.status).toBe('paused');
    expect(parsed.events[0]?.type).toBe('paused_auto');
  });
});
