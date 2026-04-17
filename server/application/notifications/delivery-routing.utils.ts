import { userDevices } from '@/server/infrastructure/db/schema';

type DeliveryDevice = typeof userDevices.$inferSelect;

type DeliveryPriority = 0 | 1 | 2 | 3;

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

/**
 * Возвращает ровно один endpoint для доставки по глобальному приоритету:
 * native > pwa > browser > legacy.
 *
 * Это соответствует продуктовому инварианту: пользователю показываем
 * только одно push-уведомление, даже если он авторизован сразу в нескольких
 * клиентах и на нескольких каналах.
 */
export function selectDeliveryTargets(
  allDevices: DeliveryDevice[]
): DeliveryDevice[] {
  const activeDevices = allDevices.filter(isDeviceActive);
  if (activeDevices.length === 0) return [];

  const sortedDevices = [...activeDevices].sort(compareDeliveryDevices);
  return sortedDevices[0] ? [sortedDevices[0]] : [];
}

/**
 * Возвращает все активные endpoint'ы в порядке глобального приоритета.
 *
 * Используется для failover: если лучший endpoint не доставился
 * (невалидный/протухший токен и т.п.), можно попробовать следующий,
 * не разваливая инвариант "не больше одного успешного уведомления".
 */
export function orderDeliveryTargetsByPriority(
  allDevices: DeliveryDevice[]
): DeliveryDevice[] {
  const activeDevices = allDevices.filter(isDeviceActive);
  if (activeDevices.length === 0) return [];
  return [...activeDevices].sort(compareDeliveryDevices);
}
