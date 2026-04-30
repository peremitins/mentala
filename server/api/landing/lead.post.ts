import { getHeader, setHeader, setResponseStatus } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { landingLeads } from '@/server/infrastructure/db/schema';
import {
  LandingLeadRequestDto,
  type LandingLeadResponseDto,
} from '@/shared/dto/landing';
import {
  normalizeEmail,
  hashEmail,
} from '@/server/application/auth/verification';
import { getClientIp } from '@/server/utils/ip';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import {
  sendLandingLeadTeamEmail,
  sendLandingLeadTelegram,
} from '@/server/application/landing/lead-notifications.service';
import {
  setLandingCorsHeaders,
  getLandingAllowedOrigins,
  normalizeLandingOrigin,
} from '@/server/utils/landing-cors';
import { normalizeMarketingAttribution } from '@/shared/utils/marketingAttribution';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
};

const localRateLimitBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();

function verifyLandingOrigin(event: any): boolean {
  const allowedOrigins = getLandingAllowedOrigins();
  if (!allowedOrigins.length) {
    return process.env.NODE_ENV !== 'production';
  }

  const origin = getHeader(event, 'origin');
  const referer = getHeader(event, 'referer');

  if (origin) {
    return allowedOrigins.includes(normalizeLandingOrigin(origin));
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return allowedOrigins.includes(refererOrigin);
    } catch {
      return false;
    }
  }

  // В production требуем хотя бы Origin или Referer.
  return process.env.NODE_ENV !== 'production';
}

async function checkRateLimitSafe(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    return await checkRateLimit(key, limit, windowSeconds);
  } catch {
    // Fallback на in-memory лимитер, если Redis временно недоступен.
    const now = Date.now();
    const current = localRateLimitBuckets.get(key);

    if (!current || now > current.resetAt) {
      const resetAt = now + windowSeconds * 1000;
      localRateLimitBuckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
      };
    }

    current.count += 1;
    localRateLimitBuckets.set(key, current);

    if (current.count <= limit) {
      return {
        allowed: true,
        remaining: Math.max(0, limit - current.count),
      };
    }

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
}

export default defineEventHandler(
  async (
    event
  ): Promise<
    LandingLeadResponseDto | { message: string; issues?: unknown }
  > => {
    // CORS-заголовки в начале, чтобы все ответы (в т.ч. 400/403/429) были доступны с mentala.app
    setLandingCorsHeaders(event);

    const parsedBody = LandingLeadRequestDto.safeParse(await readBody(event));

    if (!parsedBody.success) {
      setResponseStatus(event, 400, 'Bad Request');
      return {
        message: 'Некорректные данные формы.',
        issues: parsedBody.error.issues,
      };
    }

    if (!verifyLandingOrigin(event)) {
      setResponseStatus(event, 403, 'Forbidden');
      return {
        message: 'Origin/Referer отклонен для публичной формы.',
      };
    }

    const body = parsedBody.data;

    // Honeypot: бот-поле должно оставаться пустым.
    if (body.honeypot && body.honeypot.trim().length > 0) {
      return {
        ok: true,
        status: 'duplicate',
      };
    }

    const emailNormalized = normalizeEmail(body.email);
    const emailHash = hashEmail(emailNormalized);
    const ip = getClientIp(event) || 'unknown';

    const limits = await Promise.all([
      checkRateLimitSafe(`landing:lead:ip:${ip}`, 20, 60 * 60),
      checkRateLimitSafe(`landing:lead:email:${emailHash}`, 5, 60 * 60),
      checkRateLimitSafe(
        `landing:lead:ip_email:${ip}:${emailHash}`,
        3,
        15 * 60
      ),
    ]);

    const blocked = limits.find((item) => !item.allowed);
    if (blocked) {
      if (blocked.retryAfter) {
        setHeader(event, 'Retry-After', blocked.retryAfter);
      }

      setResponseStatus(event, 429, 'Too Many Requests');
      return {
        message: 'Слишком много запросов. Попробуйте позже.',
      };
    }

    const now = new Date();
    const goalKeyJson = body.goalKeys?.length
      ? JSON.stringify(body.goalKeys)
      : null;
    const marketingAttribution = normalizeMarketingAttribution({
      ...(body.marketingAttribution ?? {}),
      utmSource: body.marketingAttribution?.utmSource ?? body.utmSource,
      utmMedium: body.marketingAttribution?.utmMedium ?? body.utmMedium,
      utmCampaign: body.marketingAttribution?.utmCampaign ?? body.utmCampaign,
      utmContent: body.marketingAttribution?.utmContent ?? body.utmContent,
      utmTerm: body.marketingAttribution?.utmTerm ?? body.utmTerm,
      gclid: body.marketingAttribution?.gclid ?? body.gclid,
      yclid: body.marketingAttribution?.yclid ?? body.yclid,
      fbclid: body.marketingAttribution?.fbclid ?? body.fbclid,
      ttclid: body.marketingAttribution?.ttclid ?? body.ttclid,
    });

    const inserted = await db
      .insert(landingLeads)
      .values({
        name: body.name,
        email: body.email,
        emailNormalized,
        emailHash,
        goalKey: goalKeyJson,
        utmSource: marketingAttribution?.utmSource ?? body.utmSource,
        utmMedium: marketingAttribution?.utmMedium ?? body.utmMedium,
        utmCampaign: marketingAttribution?.utmCampaign ?? body.utmCampaign,
        utmContent: marketingAttribution?.utmContent ?? body.utmContent,
        utmTerm: marketingAttribution?.utmTerm ?? body.utmTerm,
        gclid: marketingAttribution?.gclid ?? body.gclid,
        yclid: marketingAttribution?.yclid ?? body.yclid,
        fbclid: marketingAttribution?.fbclid ?? body.fbclid,
        ttclid: marketingAttribution?.ttclid ?? body.ttclid,
        rawAttribution: marketingAttribution ?? null,
        referrer: getHeader(event, 'referer') || null,
        createdAt: now,
      })
      .onConflictDoNothing({ target: landingLeads.emailHash })
      .returning({ id: landingLeads.id });

    const status: 'created' | 'duplicate' = inserted.length
      ? 'created'
      : 'duplicate';

    if (status === 'created') {
      await Promise.allSettled([
        sendLandingLeadTeamEmail({
          name: body.name,
          email: body.email,
          goalKeys: body.goalKeys,
          utmSource: marketingAttribution?.utmSource ?? body.utmSource,
          utmMedium: marketingAttribution?.utmMedium ?? body.utmMedium,
          utmCampaign: marketingAttribution?.utmCampaign ?? body.utmCampaign,
          utmContent: marketingAttribution?.utmContent ?? body.utmContent,
          utmTerm: marketingAttribution?.utmTerm ?? body.utmTerm,
          gclid: marketingAttribution?.gclid ?? body.gclid,
          yclid: marketingAttribution?.yclid ?? body.yclid,
          fbclid: marketingAttribution?.fbclid ?? body.fbclid,
          ttclid: marketingAttribution?.ttclid ?? body.ttclid,
          createdAt: now,
        }),
        sendLandingLeadTelegram({
          name: body.name,
          email: body.email,
          goalKeys: body.goalKeys,
          utmSource: marketingAttribution?.utmSource ?? body.utmSource,
          utmMedium: marketingAttribution?.utmMedium ?? body.utmMedium,
          utmCampaign: marketingAttribution?.utmCampaign ?? body.utmCampaign,
          utmContent: marketingAttribution?.utmContent ?? body.utmContent,
          utmTerm: marketingAttribution?.utmTerm ?? body.utmTerm,
          gclid: marketingAttribution?.gclid ?? body.gclid,
          yclid: marketingAttribution?.yclid ?? body.yclid,
          fbclid: marketingAttribution?.fbclid ?? body.fbclid,
          ttclid: marketingAttribution?.ttclid ?? body.ttclid,
          createdAt: now,
        }),
      ]);

      setResponseStatus(event, 201, 'Created');
    }

    return {
      ok: true,
      status,
    };
  }
);
