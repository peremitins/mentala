import { describe, expect, it } from 'vitest';
import { shouldUpdateLastSeenForActivity } from '../server/application/activity/activity-classification';

describe('user engagement activity classification', () => {
  it('засчитывает startup как реальный визит', () => {
    expect(
      shouldUpdateLastSeenForActivity({
        event: 'startup',
      })
    ).toBe(true);
  });

  it('не засчитывает push-induced wake без явного открытия уведомления', () => {
    expect(
      shouldUpdateLastSeenForActivity({
        event: 'startup',
        recentPushWakeWithoutOpen: true,
      })
    ).toBe(false);

    expect(
      shouldUpdateLastSeenForActivity({
        event: 'foreground',
        clientVisible: true,
        clientFocused: true,
        recentPushWakeWithoutOpen: true,
      })
    ).toBe(false);
  });

  it('засчитывает явный клик по уведомлению даже в suppression window', () => {
    expect(
      shouldUpdateLastSeenForActivity({
        event: 'foreground',
        source: 'notification_click',
        recentPushWakeWithoutOpen: true,
      })
    ).toBe(true);
  });

  it('засчитывает foreground и heartbeat только при видимом сфокусированном клиенте', () => {
    expect(
      shouldUpdateLastSeenForActivity({
        event: 'foreground',
        clientVisible: true,
        clientFocused: true,
      })
    ).toBe(true);

    expect(
      shouldUpdateLastSeenForActivity({
        event: 'heartbeat',
        clientVisible: true,
        clientFocused: true,
      })
    ).toBe(true);

    expect(
      shouldUpdateLastSeenForActivity({
        event: 'foreground',
        clientVisible: false,
        clientFocused: true,
      })
    ).toBe(false);

    expect(
      shouldUpdateLastSeenForActivity({
        event: 'foreground',
        clientVisible: true,
        clientFocused: false,
      })
    ).toBe(false);

    expect(
      shouldUpdateLastSeenForActivity({
        event: 'foreground',
      })
    ).toBe(false);
  });

  it('не засчитывает background как визит', () => {
    expect(
      shouldUpdateLastSeenForActivity({
        event: 'background',
        clientVisible: true,
        clientFocused: true,
      })
    ).toBe(false);
  });
});
