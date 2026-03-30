import { setHeader } from 'h3';
import { buildAppleAppSiteAssociation } from '../../../shared/well-known/app-links';

/**
 * Universal Links association file (iOS).
 * Важно: endpoint должен быть публично доступен без редиректов и auth.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=300');

  return buildAppleAppSiteAssociation(process.env);
});
