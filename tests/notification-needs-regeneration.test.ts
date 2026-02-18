import { beforeEach, describe, expect, it, vi } from 'vitest';
import { needsSlotRegenerationInternal } from '../server/application/notifications/needs-regeneration.service';
import { findEnabledPreferencesByUser } from '../server/application/notifications/repositories/notification-preferences.repository';
import {
  countActiveSlotsInRange,
  getActiveSlotsHorizonTail,
} from '../server/application/notifications/repositories/notification-slots.repository';

vi.mock(
  '../server/application/notifications/repositories/notification-preferences.repository',
  () => ({
    findEnabledPreferencesByUser: vi.fn(),
  })
);

vi.mock(
  '../server/application/notifications/repositories/notification-slots.repository',
  () => ({
    countActiveSlotsInRange: vi.fn(),
    getActiveSlotsHorizonTail: vi.fn(),
  })
);

vi.mock('../server/application/notifications/timezone.utils', () => ({
  isValidTimezone: vi.fn(() => true),
}));

describe('needsSlotRegenerationInternal', () => {
  const mockedFindEnabledPreferencesByUser = vi.mocked(
    findEnabledPreferencesByUser
  );
  const mockedCountActiveSlotsInRange = vi.mocked(countActiveSlotsInRange);
  const mockedGetActiveSlotsHorizonTail = vi.mocked(getActiveSlotsHorizonTail);

  const nowUtc = new Date('2026-02-15T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindEnabledPreferencesByUser.mockResolvedValue([
      { timezone: 'Europe/Moscow', timesPerDay: 100 } as any,
    ]);
  });

  it('не регенерирует при нормальном горизонте даже если threshold низкий', async () => {
    mockedCountActiveSlotsInRange.mockResolvedValue({
      plannedCount: 12,
      queuedCount: 0,
      totalCount: 12,
    });
    mockedGetActiveSlotsHorizonTail.mockResolvedValue({
      lastScheduledAt: new Date('2026-02-15T15:00:00.000Z'),
      lastCreatedAt: new Date('2026-02-15T09:50:00.000Z'),
    });

    const decision = await needsSlotRegenerationInternal(50, { nowUtc });

    expect(decision.shouldRegenerate).toBe(false);
    expect(decision.reason).toBe('horizon_ok');
  });

  it('регенерирует при полном отсутствии активных слотов', async () => {
    mockedCountActiveSlotsInRange.mockResolvedValue({
      plannedCount: 0,
      queuedCount: 0,
      totalCount: 0,
    });
    mockedGetActiveSlotsHorizonTail.mockResolvedValue({
      lastScheduledAt: null,
      lastCreatedAt: new Date('2026-02-15T09:59:00.000Z'),
    });

    const decision = await needsSlotRegenerationInternal(50, { nowUtc });

    expect(decision.shouldRegenerate).toBe(true);
    expect(decision.reason).toBe('below_horizon');
  });

  it('регенерирует при горизонте меньше 2 часов, даже если есть rate-limit', async () => {
    mockedCountActiveSlotsInRange.mockResolvedValue({
      plannedCount: 3,
      queuedCount: 0,
      totalCount: 3,
    });
    mockedGetActiveSlotsHorizonTail.mockResolvedValue({
      lastScheduledAt: new Date('2026-02-15T11:30:00.000Z'),
      lastCreatedAt: new Date('2026-02-15T09:59:30.000Z'),
    });

    const decision = await needsSlotRegenerationInternal(50, { nowUtc });

    expect(decision.shouldRegenerate).toBe(true);
    expect(decision.reason).toBe('below_horizon');
  });
});
