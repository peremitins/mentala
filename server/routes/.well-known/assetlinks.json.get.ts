import { setHeader } from 'h3';

function splitCsv(rawValue: string | undefined): string[] {
  return Array.from(
    new Set(
      String(rawValue || '')
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

/**
 * Android App Links association file.
 * Перед релизом обязательно заполнить ANDROID_APP_LINK_SHA256_FINGERPRINTS.
 */
export default defineEventHandler(async (event) => {
  const packageName = String(
    process.env.ANDROID_APP_LINK_PACKAGE_NAME || 'com.mentala.app'
  ).trim();
  const fingerprints = splitCsv(
    process.env.ANDROID_APP_LINK_SHA256_FINGERPRINTS
  );

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=300');

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
});
