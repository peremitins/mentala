import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getNextRotationIndexMock } = vi.hoisted(() => ({
  getNextRotationIndexMock: vi.fn(),
}));

vi.mock(
  '../server/application/notifications/repositories/notification-image-rotation.repository',
  () => ({
    getNextRotationIndex: getNextRotationIndexMock,
  })
);

import { pickNotificationImage } from '../server/application/notifications/notification-images.service';

describe('notification image semantic selection', () => {
  beforeEach(() => {
    getNextRotationIndexMock.mockReset();
    getNextRotationIndexMock.mockResolvedValue(0);
  });

  it('selects alcohol harm_organs and does not fallback to nature for harm text', async () => {
    const imageUrl = await pickNotificationImage({
      userId: 42,
      kind: 'habits',
      entityKey: 'alcohol',
      imageTag: 'nature',
      text: 'Алкоголь повышает риск инфаркта и разрушает сердце и сосуды.',
      directness: 'hard',
      subtype: 'informational',
      isMixedMode: false,
      habitIntent: 'quit',
      actionHint: 'none',
      textSource: 'templates',
    });

    expect(imageUrl).toBeTruthy();
    expect(imageUrl).toContain('/notifications/habits/alcohol/harm_organs/');
    expect(imageUrl).not.toContain('/notifications/common/nature/');
  });

  it('uses common images for positive quit-habit text and skips entity catalogs', async () => {
    const quitThemes: Array<{ entityKey: string; imageTag: string }> = [
      { entityKey: 'alcohol', imageTag: 'nature' },
      { entityKey: 'nutrition', imageTag: 'neutral_abstract' },
      { entityKey: 'smoking', imageTag: 'neutral_abstract' },
      { entityKey: 'sugar', imageTag: 'neutral_abstract' },
    ];

    for (const theme of quitThemes) {
      const imageUrl = await pickNotificationImage({
        userId: 42,
        kind: 'habits',
        entityKey: theme.entityKey,
        imageTag: theme.imageTag,
        text: 'Свежий воздух и прогулка помогают восстановиться и улучшить самочувствие.',
        directness: 'moderate',
        subtype: 'motivational',
        isMixedMode: false,
        habitIntent: 'quit',
        actionHint: 'none',
        textSource: 'templates',
      });

      expect(imageUrl).toBeTruthy();
      expect(imageUrl).toContain('/notifications/common/nature/');
      expect(imageUrl).not.toContain(
        `/notifications/habits/${theme.entityKey}/`
      );
    }
  });

  it('uses mixed rotation for water between neutral_abstract and common activity', async () => {
    getNextRotationIndexMock.mockResolvedValueOnce(1);

    const imageUrl = await pickNotificationImage({
      userId: 42,
      kind: 'habits',
      entityKey: 'water',
      imageTag: 'neutral_abstract',
      text: 'После тренировки выпей воды, чтобы восстановить баланс.',
      directness: 'moderate',
      subtype: 'motivational',
      isMixedMode: false,
      habitIntent: 'build',
      actionHint: 'none',
      textSource: 'templates',
    });

    expect(imageUrl).toBeTruthy();
    expect(imageUrl).toContain('/notifications/common/activity/');
  });

  it('does not attach harm_appearance for positive nutrition text about benefits', async () => {
    const imageUrl = await pickNotificationImage({
      userId: 42,
      kind: 'habits',
      entityKey: 'nutrition',
      imageTag: 'harm_appearance',
      text: 'Питательные вещества из фруктов и овощей улучшают состояние кожи и самочувствие.',
      directness: 'moderate',
      subtype: 'motivational',
      isMixedMode: false,
      habitIntent: 'build',
      actionHint: 'none',
      textSource: 'templates',
    });

    expect(imageUrl).toBeTruthy();
    expect(imageUrl).toContain(
      '/notifications/habits/nutrition/neutral_abstract/'
    );
    expect(imageUrl).not.toContain(
      '/notifications/habits/nutrition/harm_appearance/'
    );
  });

  it('applies 50% frequency gate for sugar images', async () => {
    let sugarGateIndex = -1;
    getNextRotationIndexMock.mockImplementation(async (params: any) => {
      if (params.imageTag === 'sugar_frequency_gate') {
        sugarGateIndex += 1;
        return sugarGateIndex;
      }
      return 0;
    });

    const first = await pickNotificationImage({
      userId: 42,
      kind: 'habits',
      entityKey: 'sugar',
      imageTag: 'neutral_abstract',
      text: 'Избыток сахара повышает риск ожирения и ухудшает состояние организма.',
      directness: 'hard',
      subtype: 'informational',
      isMixedMode: false,
      habitIntent: 'quit',
      actionHint: 'none',
      textSource: 'templates',
    });

    const second = await pickNotificationImage({
      userId: 42,
      kind: 'habits',
      entityKey: 'sugar',
      imageTag: 'neutral_abstract',
      text: 'Избыток сахара повышает риск ожирения и ухудшает состояние организма.',
      directness: 'hard',
      subtype: 'informational',
      isMixedMode: false,
      habitIntent: 'quit',
      actionHint: 'none',
      textSource: 'templates',
    });

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });
});
