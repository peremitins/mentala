import { describe, expect, it } from 'vitest';
import {
  buildDeliveryTargetGroups,
  orderDeliveryTargetsByPriority,
  selectDeliveryTargets,
} from '../server/application/notifications/delivery-routing.utils';

function makeDevice(
  overrides: Partial<{
    id: string;
    token: string;
    platform: 'ios' | 'android' | 'web';
    channelType: 'native' | 'pwa' | 'browser';
    platformFamily: 'ios' | 'android' | 'desktop' | null;
    isActive: boolean | null;
    isPrimary: boolean;
    installationId: string | null;
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
    platformFamily:
      'platformFamily' in overrides ? overrides.platformFamily : 'desktop',
    installationId:
      'installationId' in overrides ? overrides.installationId : 'device-1',
    isActive: overrides.isActive ?? true,
    isPrimary: overrides.isPrimary ?? false,
    lastSeen: overrides.lastSeen ?? new Date('2026-04-17T10:00:00.000Z'),
    createdAt: overrides.createdAt ?? new Date('2026-04-17T09:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-04-17T10:00:00.000Z'),
  };
}

describe('notification delivery routing', () => {
  it('оставляет только native, если native и web push относятся к одному устройству', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'ios',
        installationId: 'ios-phone',
        lastSeen: new Date('2026-04-17T10:10:00.000Z'),
      }),
      makeDevice({
        id: 'pwa',
        token: 'pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'ios',
        installationId: 'ios-phone',
        lastSeen: new Date('2026-04-17T10:20:00.000Z'),
      }),
      makeDevice({
        id: 'native',
        token: 'native-token',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: 'ios-phone',
        isPrimary: true,
        lastSeen: new Date('2026-04-17T10:05:00.000Z'),
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('native');
  });

  it('отправляет на разные native-устройства одного пользователя', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'iphone',
        token: 'iphone-token',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: 'iphone-device',
      }),
      makeDevice({
        id: 'ipad',
        token: 'ipad-token',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: 'ipad-device',
      }),
      makeDevice({
        id: 'android-phone',
        token: 'android-phone-token',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        installationId: 'android-phone-device',
      }),
      makeDevice({
        id: 'android-tablet',
        token: 'android-tablet-token',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        installationId: 'android-tablet-device',
      }),
    ]);

    expect(selected.map((device) => device.id).sort()).toEqual([
      'android-phone',
      'android-tablet',
      'ipad',
      'iphone',
    ]);
  });

  it('предпочитает установленный PWA обычному браузеру на том же устройстве, если native нет', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'desktop',
        installationId: 'desktop-device',
        lastSeen: new Date('2026-04-17T10:30:00.000Z'),
      }),
      makeDevice({
        id: 'pwa',
        token: 'pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'desktop',
        installationId: 'desktop-device',
        lastSeen: new Date('2026-04-17T10:00:00.000Z'),
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('pwa');
  });

  it('игнорирует явно деактивированные устройства', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'inactive-native',
        token: 'inactive-native-token',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        installationId: 'android-device',
        isActive: false,
        lastSeen: new Date('2026-04-17T11:00:00.000Z'),
      }),
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'desktop',
        installationId: 'desktop-device',
      }),
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('browser');
  });

  it('строит fallback-цепочку внутри одного устройства: native -> pwa -> browser', () => {
    const ordered = orderDeliveryTargetsByPriority([
      makeDevice({
        id: 'browser',
        token: 'browser-token',
        platform: 'web',
        channelType: 'browser',
        platformFamily: 'android',
        installationId: 'android-device',
        lastSeen: new Date('2026-04-17T10:30:00.000Z'),
      }),
      makeDevice({
        id: 'native',
        token: 'native-token',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        installationId: 'android-device',
        lastSeen: new Date('2026-04-17T10:20:00.000Z'),
      }),
      makeDevice({
        id: 'pwa',
        token: 'pwa-token',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'android',
        installationId: 'android-device',
        lastSeen: new Date('2026-04-17T10:10:00.000Z'),
      }),
    ]);

    expect(ordered.map((device) => device.id)).toEqual([
      'native',
      'pwa',
      'browser',
    ]);
  });

  it('не склеивает legacy-токены без installationId между разными устройствами', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'legacy-iphone',
        token: 'legacy-iphone-token',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: null,
      }),
      makeDevice({
        id: 'legacy-ipad',
        token: 'legacy-ipad-token',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: null,
      }),
    ]);

    expect(selected.map((device) => device.id).sort()).toEqual([
      'legacy-ipad',
      'legacy-iphone',
    ]);
  });

  it('возвращает группы с кандидатами для failover по каждому устройству', () => {
    const groups = buildDeliveryTargetGroups([
      makeDevice({
        id: 'iphone-native',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: 'iphone',
        lastSeen: new Date('2026-04-17T10:10:00.000Z'),
      }),
      makeDevice({
        id: 'iphone-pwa',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'ios',
        installationId: 'iphone',
        lastSeen: new Date('2026-04-17T10:09:00.000Z'),
      }),
      makeDevice({
        id: 'ipad-native',
        platform: 'ios',
        channelType: 'native',
        platformFamily: 'ios',
        installationId: 'ipad',
        lastSeen: new Date('2026-04-17T10:00:00.000Z'),
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.candidates.map((d) => d.id))).toEqual([
      ['iphone-native', 'iphone-pwa'],
      ['ipad-native'],
    ]);
  });

  it('использует mobile PWA как fallback для native той же платформы, даже если installationId отличается', () => {
    const groups = buildDeliveryTargetGroups([
      makeDevice({
        id: 'android-native',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        installationId: 'native-device-id',
        lastSeen: new Date('2026-04-28T15:00:00.000Z'),
      }),
      makeDevice({
        id: 'android-pwa',
        platform: 'web',
        channelType: 'pwa',
        platformFamily: 'android',
        installationId: 'pwa-installation-id',
        lastSeen: new Date('2026-04-28T15:01:00.000Z'),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.candidates.map((device) => device.id)).toEqual([
      'android-native',
      'android-pwa',
    ]);
    expect(selectDeliveryTargets(groups[0]?.candidates ?? [])).toHaveLength(1);
  });

  it('не создаёт отдельную доставку для старого mobile native без installationId, если есть современный native', () => {
    const selected = selectDeliveryTargets([
      makeDevice({
        id: 'android-native',
        platform: 'android',
        channelType: 'native',
        platformFamily: 'android',
        installationId: 'native-device-id',
        lastSeen: new Date('2026-04-28T15:00:00.000Z'),
      }),
      makeDevice({
        id: 'legacy-android-native',
        platform: 'android',
        channelType: 'native',
        platformFamily: null,
        installationId: null,
        lastSeen: new Date('2026-04-02T09:00:00.000Z'),
      }),
    ]);

    expect(selected.map((device) => device.id)).toEqual(['android-native']);
  });
});
