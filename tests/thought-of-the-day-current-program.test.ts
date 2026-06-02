import { beforeEach, describe, expect, it, vi } from 'vitest';

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getSessionUserWithRole: vi.fn(),
}));

const programMocks = vi.hoisted(() => ({
  DEFAULT_RETENTION_PROGRAM_SLUG: 'calm_anxiety_30',
  getCurrentProgramSlugForUser: vi.fn(),
  getLocalDateKey: vi.fn(),
  getOrCreateProgramOverview: vi.fn(),
  getOrCreateThoughtOfTheDay: vi.fn(),
  getUserTimezone: vi.fn(),
  saveThoughtOfTheDay: vi.fn(),
}));

vi.mock('h3', () => ({
  createError: (input: unknown) => input,
  defineEventHandler: (handler: unknown) => handler,
  readBody: h3Mocks.readBody,
}));

vi.mock('@/server/utils/require-role', () => authMocks);

vi.mock('@/server/application/programs/retention-program.service', () => ({
  DEFAULT_RETENTION_PROGRAM_SLUG: programMocks.DEFAULT_RETENTION_PROGRAM_SLUG,
  getCurrentProgramSlugForUser: programMocks.getCurrentProgramSlugForUser,
  getLocalDateKey: programMocks.getLocalDateKey,
  getOrCreateProgramOverview: programMocks.getOrCreateProgramOverview,
  getOrCreateThoughtOfTheDay: programMocks.getOrCreateThoughtOfTheDay,
  getUserTimezone: programMocks.getUserTimezone,
  saveThoughtOfTheDay: programMocks.saveThoughtOfTheDay,
}));

const userId = 42;
const entryDate = '2026-05-27';

function baseThought() {
  return {
    id: 7,
    entryDate,
    text: 'Самоподдержка начинается с тона, которым ты говоришь с собой.',
    source: 'fallback',
    saved: false,
  };
}

describe('thought-of-the-day endpoints current program binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getSessionUserWithRole.mockResolvedValue({ id: userId });
    programMocks.getUserTimezone.mockResolvedValue('Europe/Moscow');
    programMocks.getLocalDateKey.mockReturnValue(entryDate);
    programMocks.getCurrentProgramSlugForUser.mockResolvedValue(
      'self_kindness_21'
    );
    programMocks.getOrCreateProgramOverview.mockResolvedValue({
      slug: 'self_kindness_21',
      currentStep: 4,
    });
    programMocks.getOrCreateThoughtOfTheDay.mockResolvedValue(baseThought());
    programMocks.saveThoughtOfTheDay.mockResolvedValue({
      item: { ...baseThought(), saved: true },
      rewardGranted: true,
      energyToday: 1,
      energyWeekly: 1,
    });
  });

  it('GET создаёт мысль дня для текущего сада пользователя', async () => {
    const handler = (await import('../server/api/thought-of-the-day.get'))
      .default as (event: unknown) => Promise<unknown>;

    await handler({});

    expect(programMocks.getCurrentProgramSlugForUser).toHaveBeenCalledWith(
      userId
    );
    expect(programMocks.getOrCreateProgramOverview).toHaveBeenCalledWith(
      userId,
      'self_kindness_21'
    );
    expect(programMocks.getOrCreateThoughtOfTheDay).toHaveBeenCalledWith({
      userId,
      entryDate,
      programSlug: 'self_kindness_21',
      step: 4,
    });
  });

  it('POST save сохраняет мысль дня в контексте текущего сада пользователя', async () => {
    h3Mocks.readBody.mockResolvedValue({ id: 7 });
    const handler = (await import('../server/api/thought-of-the-day/save.post'))
      .default as (event: unknown) => Promise<unknown>;

    await handler({});

    expect(programMocks.getCurrentProgramSlugForUser).toHaveBeenCalledWith(
      userId
    );
    expect(programMocks.getOrCreateProgramOverview).toHaveBeenCalledWith(
      userId,
      'self_kindness_21'
    );
    expect(programMocks.saveThoughtOfTheDay).toHaveBeenCalledWith({
      userId,
      entryDate,
      programSlug: 'self_kindness_21',
      step: 4,
      thoughtId: 7,
    });
  });
});
