import { describe, expect, it } from 'vitest';
import {
  getDefaultNotificationTextSource,
  normalizeRequestedNotificationTextSource,
} from '../shared/utils/notificationTextSource';

describe('notificationTextSource utils', () => {
  it('по умолчанию выбирает AI при доступном entitlement', () => {
    expect(getDefaultNotificationTextSource(true)).toBe('ai');
  });

  it('по умолчанию выбирает шаблоны без доступа к AI', () => {
    expect(getDefaultNotificationTextSource(false)).toBe('templates');
  });

  it('не подставляет значение, если клиент ничего не прислал', () => {
    expect(normalizeRequestedNotificationTextSource(undefined, true)).toBe(
      undefined
    );
  });

  it('принудительно откатывает ai в templates без entitlement', () => {
    expect(normalizeRequestedNotificationTextSource('ai', false)).toBe(
      'templates'
    );
  });
});
