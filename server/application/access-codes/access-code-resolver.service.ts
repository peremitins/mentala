import { getAccessCodeAvailability } from '@/server/application/promo-codes/access-code.service';
import type { AccessCodeKind } from '@/shared/dto';

/**
 * Детерминированный resolver для пользовательского ввода кода доступа.
 *
 * Глобальная уникальность кода уже гарантирована на бэке через
 * `assertAccessCodeAvailable()`: один и тот же код не может одновременно
 * существовать в `promo_campaigns` и в `user_referral_profiles`.
 *
 * Поэтому для входной строки можно однозначно определить тип (promo | referral),
 * без try/catch и без 404-fallback на стороне клиента.
 *
 * Возвращает `null`, если код вообще не существует.
 */
export async function resolveAccessCodeKind(params: {
  code: string;
  tx?: any;
}): Promise<AccessCodeKind | null> {
  const availability = await getAccessCodeAvailability({
    code: params.code,
    tx: params.tx,
  });

  if (availability.available) {
    return null;
  }

  if (availability.conflictType === 'promo_campaign') {
    return 'promo';
  }

  if (availability.conflictType === 'referral_profile') {
    return 'referral';
  }

  return null;
}
