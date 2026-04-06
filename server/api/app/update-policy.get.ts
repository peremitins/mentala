import { defineEventHandler, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { appVersionPolicy } from '@/server/infrastructure/db/schema';
import type { UpdatePolicyResponse } from '@/shared/dto/update-policy';

// In-memory кэш с TTL 60 секунд
let cache: {
  data: Map<string, typeof appVersionPolicy.$inferSelect>;
  expiry: number;
} = {
  data: new Map(),
  expiry: 0,
};

const CACHE_TTL_MS = 60_000;

async function getPolicyCached() {
  const now = Date.now();
  if (cache.expiry > now && cache.data.size > 0) {
    return cache.data;
  }

  const rows = await db.select().from(appVersionPolicy);
  const map = new Map<string, typeof appVersionPolicy.$inferSelect>();
  for (const row of rows) {
    map.set(row.platform, row);
  }

  cache = { data: map, expiry: now + CACHE_TTL_MS };
  return map;
}

export default defineEventHandler(
  async (event): Promise<UpdatePolicyResponse> => {
    const platform = (getHeader(event, 'x-platform') || '').toLowerCase();
    const buildRaw = getHeader(event, 'x-app-build');

    // Web или неизвестная платформа — всегда ok
    if (platform !== 'ios' && platform !== 'android') {
      return {
        status: 'ok',
        minimumSupportedBuild: 0,
        storeUrl: '',
        title: '',
        message: '',
      };
    }

    // Старые mobile build без заголовка X-App-Build — не блокируем (обратная совместимость)
    const build = buildRaw ? parseInt(buildRaw, 10) : null;
    if (build === null || isNaN(build)) {
      return {
        status: 'ok',
        minimumSupportedBuild: 0,
        storeUrl: '',
        title: '',
        message: '',
      };
    }

    const policies = await getPolicyCached();
    const policy = policies.get(platform);

    if (!policy) {
      return {
        status: 'ok',
        minimumSupportedBuild: 0,
        storeUrl: '',
        title: '',
        message: '',
      };
    }

    const needsUpdate = build < policy.minimumSupportedBuild;

    if (needsUpdate) {
      console.warn('[Update Policy] Blocked:', {
        platform,
        build,
        minimumSupportedBuild: policy.minimumSupportedBuild,
      });
    }

    return {
      status: needsUpdate ? 'required' : 'ok',
      minimumSupportedBuild: policy.minimumSupportedBuild,
      storeUrl: policy.storeUrl,
      title: policy.blockerTitle || '',
      message: policy.blockerMessage || '',
    };
  }
);
