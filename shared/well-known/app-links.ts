type EnvMap = Record<string, string | undefined>;

function splitEnvList(
  rawValue: string | undefined,
  fallback: string[] = []
): string[] {
  const normalized = String(rawValue || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  return Array.from(new Set(fallback));
}

/**
 * Собирает payload для Android Digital Asset Links.
 * Значения берутся из runtime/build env, чтобы landing и app публиковали один формат.
 */
export function buildAndroidAssetLinks(env: EnvMap = process.env) {
  const packageName = String(
    env.ANDROID_APP_LINK_PACKAGE_NAME || 'com.mentala.app'
  ).trim();
  const fingerprints = splitEnvList(env.ANDROID_APP_LINK_SHA256_FINGERPRINTS);

  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/**
 * Собирает payload для iOS Universal Links / Shared Web Credentials.
 * Для статического landing это происходит на этапе generate, для app — в runtime.
 */
export function buildAppleAppSiteAssociation(env: EnvMap = process.env) {
  const teamId = String(env.IOS_APP_LINK_TEAM_ID || '8QMGJ847K5').trim();
  const bundleIds = splitEnvList(
    env.IOS_APP_LINK_BUNDLE_IDS ||
      env.APPLE_IAP_BUNDLE_IDS ||
      env.NUXT_APPLE_IAP_BUNDLE_IDS ||
      env.NUXT_APPLE_IAP_BUNDLE_ID,
    ['com.mentala.app']
  );
  const appIds = bundleIds.map((bundleId) => `${teamId}.${bundleId}`);

  return {
    applinks: {
      apps: [],
      details: appIds.map((appID) => ({
        appID,
        paths: ['/payment-success*', '/auth/external-session/consume*'],
      })),
    },
    webcredentials: {
      apps: appIds,
    },
  };
}
