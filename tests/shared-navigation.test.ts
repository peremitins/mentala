import { describe, expect, it } from 'vitest';
import {
  buildAppNavigationPath,
  buildLegacyNotificationNavigation,
  buildLegacySuggestedChipActionPayload,
  resolveGuaranteedTargetFromNotificationContext,
  resolveTargetFromLegacyNotificationNavigation,
  resolveTargetFromLegacySuggestedChipAction,
} from '../shared/navigation/index';

describe('shared navigation', () => {
  it('строит target из legacy meditation action', () => {
    const target = resolveTargetFromLegacySuggestedChipAction({
      action: 'open_meditation_track',
      params: {
        trackId: 'ultimate-relaxation',
      },
    });

    expect(target).toEqual({
      type: 'meditation_track',
      trackId: 'ultimate-relaxation',
    });
  });

  it('строит legacy action payload из typed breath target', () => {
    const payload = buildLegacySuggestedChipActionPayload({
      type: 'breath_practice',
      slug: '4-7-8',
      groupKey: 'sleep',
    });

    expect(payload).toEqual({
      action: 'open_breath_practice',
      params: {
        practiceId: '4-7-8',
        groupKey: 'sleep',
        source: 'chat',
      },
    });
  });

  it('собирает путь для quick help entry', () => {
    const path = buildAppNavigationPath({
      type: 'quick_help_entry',
      entry: 'panic',
    });

    expect(path).toBe('/quick-help?entry=panic');
  });

  it('собирает путь для breath group через preferred slug по умолчанию', () => {
    const path = buildAppNavigationPath({
      type: 'breath_practice_group',
      groupKey: 'anxiety',
    });

    expect(path).toBe('/breath-practices/long-exhale-4-6?group=anxiety');
  });

  it('распознаёт дневник благодарности по контексту уведомления', () => {
    const target = resolveGuaranteedTargetFromNotificationContext({
      title: 'Дневник благодарности',
      entityKey: 'gratitude',
    });

    expect(target).toEqual({
      type: 'gratitude_diary',
    });
  });

  it('конвертирует gratitude diary через legacy navigation без потери маршрута', () => {
    const navigation = buildLegacyNotificationNavigation({
      type: 'gratitude_diary',
    });

    expect(navigation).toEqual({
      type: 'gratitude_diary',
    });
    expect(
      resolveTargetFromLegacyNotificationNavigation({
        type: 'gratitude_diary',
      })
    ).toEqual({
      type: 'gratitude_diary',
    });
  });
});
