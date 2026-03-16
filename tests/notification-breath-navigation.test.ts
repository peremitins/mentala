import { describe, expect, it } from 'vitest';
import {
  buildDeepLinkFromNavigation,
  resolveNavigationFromActionHint,
  resolveNavigationTargetFromActionHint,
} from '../server/application/notifications/breath-navigation.utils';

describe('notification breath navigation', () => {
  it('маппит 4-4-4-4 на box-breathing', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Сделай 3 цикла 4-4-4-4 прямо сейчас.'
    );

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: 'box-breathing',
    });
  });

  it('маппит 4-7-8 на 4-7-8', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Попробуй дыхание 4-7-8 для успокоения.'
    );

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: '4-7-8',
    });
  });

  it('маппит 4-6 на long-exhale-4-6', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Техника 4-6 снимает тревогу.'
    );

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: 'long-exhale-4-6',
    });
  });

  it('маппит квадратное/коробочное дыхание на box-breathing', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Квадратное дыхание помогает вернуть фокус.'
    );

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: 'box-breathing',
    });
  });

  it('при дыхании без конкретной техники использует fallback box-breathing', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Сделай несколько медленных циклов дыхания.'
    );

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: 'box-breathing',
    });
  });

  it('для none возвращает home без регрессии', () => {
    const navigation = resolveNavigationFromActionHint(
      'none',
      'Любой нейтральный текст без рекомендаций.'
    );

    expect(navigation).toEqual({ type: 'home' });
  });

  it('deepLink для fallback-slug добавляет group=popular', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Просто подыши 5 циклов спокойно.'
    );
    const deepLink = buildDeepLinkFromNavigation(navigation);

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: 'box-breathing',
    });
    expect(deepLink).toBe('/breath-practices/box-breathing?group=popular');
  });

  it('при конфликте маркеров приоритет у первого совпадения (4-7-8 проверяется раньше)', () => {
    const navigation = resolveNavigationFromActionHint(
      'breathing',
      'Сравни 4-7-8 и 4-4-4-4 и выбери технику.'
    );

    expect(navigation).toEqual({
      type: 'breath_practice',
      slug: '4-7-8',
    });
  });

  it('строит typed target для push orchestration', () => {
    const target = resolveNavigationTargetFromActionHint(
      'breathing',
      'Попробуй дыхание 4-7-8 для успокоения.'
    );

    expect(target).toEqual({
      type: 'breath_practice',
      slug: '4-7-8',
      groupKey: 'sleep',
    });
  });
});
