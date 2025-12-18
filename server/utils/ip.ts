import { getHeader } from 'h3';

/**
 * Нормализует IP адрес (убирает ::ffff: префикс для IPv4)
 */
function normalizeRemoteAddress(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip;
}

/**
 * Получает IP адрес клиента из запроса
 * Используется динамическое определение IP с учетом всех источников
 */
export function getClientIp(event: any): string | null {
  const xForwardedFor = getHeader(event, 'x-forwarded-for');
  if (xForwardedFor) {
    const first = String(xForwardedFor).split(',')[0]?.trim();
    if (first) return normalizeRemoteAddress(first);
  }

  const xRealIp = getHeader(event, 'x-real-ip');
  if (xRealIp) return normalizeRemoteAddress(String(xRealIp).trim());

  const remote = event?.node?.req?.socket?.remoteAddress;
  if (remote) return normalizeRemoteAddress(String(remote));

  return null;
}

