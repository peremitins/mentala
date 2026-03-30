import { setHeader } from 'h3';
import { buildAndroidAssetLinks } from '../../../shared/well-known/app-links';

/**
 * Android App Links association file.
 * Перед релизом обязательно заполнить ANDROID_APP_LINK_SHA256_FINGERPRINTS.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=300');

  return buildAndroidAssetLinks(process.env);
});
