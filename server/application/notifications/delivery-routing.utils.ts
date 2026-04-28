import { userDevices } from '@/server/infrastructure/db/schema';

type DeliveryDevice = typeof userDevices.$inferSelect;

type DeliveryPriority = 0 | 1 | 2 | 3;

export type DeliveryTargetGroup = {
  deviceKey: string;
  candidates: DeliveryDevice[];
};

function isDeviceActive(device: DeliveryDevice): boolean {
  return device.isActive === true || device.isActive === null;
}

function getDeviceTimestamp(device: DeliveryDevice): number {
  return (
    device.lastSeen?.getTime() ??
    device.updatedAt?.getTime() ??
    device.createdAt?.getTime() ??
    0
  );
}

function resolveDeliveryPriority(device: DeliveryDevice): DeliveryPriority {
  const platform = String(device.platform || '').toLowerCase();
  const channelType = String(device.channelType || '').toLowerCase();

  // Старые mobile-токены после миграции могли остаться без platformFamily,
  // поэтому приоритизируем native по platform, а не только по channelType.
  if (
    (platform === 'ios' || platform === 'android') &&
    (channelType === 'native' || channelType === '')
  ) {
    return 3;
  }

  if (channelType === 'pwa') {
    return 2;
  }

  // Обычный браузерный web push и старые web-записи без channelType.
  if (channelType === 'browser' || platform === 'web') {
    return 1;
  }

  // Совсем старые/непонятные записи держим как fallback последнего приоритета.
  return 0;
}

function compareDeliveryDevices(a: DeliveryDevice, b: DeliveryDevice): number {
  const priorityDelta = resolveDeliveryPriority(b) - resolveDeliveryPriority(a);
  if (priorityDelta !== 0) return priorityDelta;

  const primaryDelta =
    Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
  if (primaryDelta !== 0) return primaryDelta;

  return getDeviceTimestamp(b) - getDeviceTimestamp(a);
}

function resolveDeviceKey(device: DeliveryDevice): string {
  const platformFamily = String(
    device.platformFamily || device.platform || 'unknown'
  ).toLowerCase();
  const installationId =
    typeof device.installationId === 'string'
      ? device.installationId.trim()
      : '';

  if (installationId) {
    return `${platformFamily}:${installationId}`;
  }

  // Legacy-записи без installationId нельзя надежно склеивать между собой:
  // это могут быть разные физические устройства одного пользователя.
  return `legacy:${device.id || device.token}`;
}

function resolvePlatformFamilyKey(device: DeliveryDevice): string {
  return String(device.platformFamily || device.platform || '').toLowerCase();
}

function isMobilePlatformFamily(platformFamily: string): boolean {
  return platformFamily === 'ios' || platformFamily === 'android';
}

function isNativeChannel(device: DeliveryDevice): boolean {
  const channelType = String(device.channelType || '').toLowerCase();
  return channelType === 'native' || channelType === '';
}

function hasInstallationId(device: DeliveryDevice): boolean {
  return (
    typeof device.installationId === 'string' &&
    device.installationId.trim().length > 0
  );
}

function compareDeliveryGroups(
  a: DeliveryTargetGroup,
  b: DeliveryTargetGroup
): number {
  const aTop = a.candidates[0];
  const bTop = b.candidates[0];
  if (!aTop || !bTop) return 0;

  const deviceDelta = compareDeliveryDevices(aTop, bTop);
  if (deviceDelta !== 0) return deviceDelta;

  return a.deviceKey.localeCompare(b.deviceKey);
}

export function buildDeliveryTargetGroups(
  allDevices: DeliveryDevice[]
): DeliveryTargetGroup[] {
  const activeDevices = allDevices.filter(isDeviceActive);
  if (activeDevices.length === 0) return [];

  const groups = new Map<string, DeliveryDevice[]>();
  const nativeAnchorByFamily = new Map<string, DeliveryDevice>();

  for (const device of activeDevices) {
    const platformFamily = resolvePlatformFamilyKey(device);
    if (
      !isMobilePlatformFamily(platformFamily) ||
      !isNativeChannel(device) ||
      !hasInstallationId(device)
    ) {
      continue;
    }

    const currentAnchor = nativeAnchorByFamily.get(platformFamily);
    if (!currentAnchor || compareDeliveryDevices(device, currentAnchor) < 0) {
      nativeAnchorByFamily.set(platformFamily, device);
    }
  }

  for (const device of activeDevices) {
    const platformFamily = resolvePlatformFamilyKey(device);
    const nativeAnchor = nativeAnchorByFamily.get(platformFamily);
    const shouldUseNativeAnchor =
      Boolean(nativeAnchor) &&
      isMobilePlatformFamily(platformFamily) &&
      (!isNativeChannel(device) || !hasInstallationId(device));
    const deviceKey =
      shouldUseNativeAnchor && nativeAnchor
        ? resolveDeviceKey(nativeAnchor)
        : resolveDeviceKey(device);
    const existing = groups.get(deviceKey) ?? [];
    existing.push(device);
    groups.set(deviceKey, existing);
  }

  return [...groups.entries()]
    .map(([deviceKey, devices]) => ({
      deviceKey,
      candidates: [...devices].sort(compareDeliveryDevices),
    }))
    .sort(compareDeliveryGroups);
}

/**
 * Возвращает по одному endpoint для каждого физического устройства.
 *
 * Внутри устройства применяется приоритет native > pwa > browser > legacy,
 * но разные устройства одного пользователя получают уведомления независимо.
 */
export function selectDeliveryTargets(
  allDevices: DeliveryDevice[]
): DeliveryDevice[] {
  return buildDeliveryTargetGroups(allDevices)
    .map((group) => group.candidates[0])
    .filter((device): device is DeliveryDevice => Boolean(device));
}

/**
 * Возвращает все активные endpoint'ы, сгруппированные по устройствам.
 *
 * Используется для failover внутри каждого устройства: если лучший канал
 * не доставился, можно попробовать следующий, не делая дубль на том же устройстве.
 */
export function orderDeliveryTargetsByPriority(
  allDevices: DeliveryDevice[]
): DeliveryDevice[] {
  return buildDeliveryTargetGroups(allDevices).flatMap(
    (group) => group.candidates
  );
}
