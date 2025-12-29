import { setResponseHeader } from 'h3';
import { OAuthLinkSendCodeDto } from '@/shared/dto/auth';
import {
  getLinkingData,
  getLinkCodeKey,
} from '@/server/application/auth/oauth-linking';
import { issueVerificationCode } from '@/server/application/auth/email-verification.service';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { getClientIp } from '@/server/utils/ip';

export default defineEventHandler(async (event) => {
  const body = OAuthLinkSendCodeDto.parse(await readBody(event as any));
  const linkingToken = body.linkingToken;

  const linkingData = await getLinkingData(linkingToken);
  if (!linkingData) {
    return { success: true };
  }

  const ip = getClientIp(event) || 'unknown';
  const rateLimit = await checkRateLimit(
    `auth:rate_limit:oauth_link_code:${linkingToken}:${ip}`,
    1,
    60
  );
  if (!rateLimit.allowed) {
    if (rateLimit.retryAfter) {
      setResponseHeader(event, 'Retry-After', rateLimit.retryAfter);
    }
    return { success: true, retryAfter: rateLimit.retryAfter };
  }

  await issueVerificationCode(getLinkCodeKey(linkingToken), linkingData.email);

  return { success: true };
});
