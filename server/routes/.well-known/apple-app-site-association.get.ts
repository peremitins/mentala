import { setHeader } from 'h3';

function splitCsv(rawValue: string | undefined, fallback: string[]): string[] {
  const normalized = String(rawValue || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  return fallback;
}

/**
 * Universal Links association file (iOS).
 * Важно: endpoint должен быть публично доступен без редиректов и auth.
 */
export default defineEventHandler(async (event) => {
  const teamId = String(process.env.IOS_APP_LINK_TEAM_ID || '8QMGJ847K5').trim();
  const bundleIds = splitCsv(process.env.IOS_APP_LINK_BUNDLE_IDS, [
    'com.mentala.app',
  ]);

  const appIds = bundleIds.map((bundleId) => `${teamId}.${bundleId}`);

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=300');

  return {
    applinks: {
      apps: [],
      details: appIds.map((appID) => ({
        appID,
        paths: [
          '/payment-success*',
          '/auth/external-session/consume*',
        ],
      })),
    },
    webcredentials: {
      apps: appIds,
    },
  };
});
