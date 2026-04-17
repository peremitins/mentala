import { describe, expect, it } from 'vitest';
import { selectDeliveryTargets } from '../server/application/notifications/delivery-routing.utils';

function makeDevice(
  overrides: Partial<{
    id: string;
    token: string;
    platform: 'ios' | 'android' | 'web';
    channelType: 'native' | 'pwa' | 'browser';
    platformFamily: 'ios' | 'android' | 'desktop' | null;
    isActive: boolean | null;
    isPrimary: boolean;
    lastSeen: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = {}
) {
  return {
    id: overrides.id ?? 'device-id',
    userId: 1,
    token: overrides.token ?? 'token',
    platform: overrides.platform ?? 'web',
    appEnv: 'dev',
    channelType: overrides.channelType ?? 'browser',
    platformFamily: overrides.platformFamily ?? 'desktop',
    installationId: null,
    isActive: overrides.isActive ?? true,
    isPrimary: overrides.isPrimary ?? false,
    lastSeen: overrides.lastSeen ?? new Date('2026-04-17T10:00:00.000Z'),
    createdAt: overrides.createdAt ?? new Date('2026-04-17T09:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-17T10:00:00.000Z'),
  };
}

describe('notification delivery routing', () => {
  it('оставляет только native, если активны native и web push', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'desktop',
        lastSeen: new Date('2026-04-17T10:10:00.000Z'),
      }),
      makeDevice({
        id: 'pwa',
        token: 'pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'ios',
        lastSeen: new Date('2026-04-17T10:20:00.000Z'),
      }),
      makeDevice({
        id: 'native',
        token: 'native-token',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        isPrimary: true,
        lastSeen: new Date('2026-04-17T10:05:00.000Z'),
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('native');
  });

  it('предпочитает установленный PWA обычному браузеру, если native нет', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'desktop',
        lastSeen: new Date('2026-04-17T10:30:00.000Z'),
      }),
      makeDevice({
        id: 'pwa',
        token: 'pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'desktop',
        lastSeen: new Date('2026-04-17T10:00:00.000Z'),
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('pwa');
  });

  it('берёт самый свежий endpoint внутри одного приоритета', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'older-pwa',
        token: 'older-pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'desktop',
        lastSeen: new Date('2026-04-17T09:00:00.000Z'),
      }),
      makeDevice({
        id: 'newer-pwa',
        token: 'newer-pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'android',
        lastSeen: new Date('2026-04-17T11:00:00.000Z'),
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('newer-pwa');
  });

  it('игнорирует явно деактивированные устройства', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'inactive-native',
        token: 'inactive-native-token',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        isActive: false,
        lastSeen: new Date('2026-04-17T11:00:00.000Z'),
      }),
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'desktop',
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('browser');
  });
});
