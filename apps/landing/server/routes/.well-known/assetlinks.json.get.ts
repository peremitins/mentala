import { setHeader } from 'h3';
import { buildAndroidAssetLinks } from '../../../../../shared/well-known/app-links';

/**
 * Для landing endpoint генерируется на этапе `nuxt generate`,
 * поэтому env должны попасть в CI до статического экспорта.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=300');

  return buildAndroidAssetLinks(process.env);
});
