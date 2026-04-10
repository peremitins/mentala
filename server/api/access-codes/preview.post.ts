import { createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { AccessCodePreviewRequestDto } from '@/shared/dto/access-code';
import { resolveAccessCodeKind } from '@/server/application/access-codes/access-code-resolver.service';
import { previewPromoCode } from '@/server/application/promo-codes/promo-code-preview.service';
import { previewReferralCode } from '@/server/application/referral/referral-redeem.service';
import { assertInternalPromoAvailable } from '@/server/application/promo-codes/promo-provider-guard.service';

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  await assertInternalPromoAvailable({
    event,
    userId: session.user.id,
  });

  const body = AccessCodePreviewRequestDto.parse(await readBody(event));

  const kind = await resolveAccessCodeKind({ code: body.code });
  if (!kind) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Код не найден',
      data: { code: 'E_NOT_FOUND' },
    });
  }

  if (kind === 'promo') {
    const promoResult = await previewPromoCode({
      userId: session.user.id,
      code: body.code,
    });
    return { ...promoResult, kind: 'promo' as const };
  }

  const referralResult = await previewReferralCode({
    userId: session.user.id,
    code: body.code,
  });
  return { ...referralResult, kind: 'referral' as const };
});
