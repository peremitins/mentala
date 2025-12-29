import { getRequestURL } from 'h3';

export function resolveAppUrl(event: any, configuredAppUrl?: string): string {
  const requestUrl = getRequestURL(event);
  const requestOrigin = requestUrl.origin.replace(/\/$/, '');
  const configured = (configuredAppUrl || '').replace(/\/$/, '');
  const isProd = process.env.NODE_ENV === 'production';

  if (!configured) return requestOrigin;

  if (!isProd && configured !== requestOrigin) {
    return requestOrigin;
  }

  const configuredIsLocal =
    configured.includes('localhost') ||
    configured.includes('127.0.0.1') ||
    configured.includes('0.0.0.0');
  const requestIsLocal =
    requestOrigin.includes('localhost') ||
    requestOrigin.includes('127.0.0.1') ||
    requestOrigin.includes('0.0.0.0');

  if (configuredIsLocal && !requestIsLocal) {
    return requestOrigin;
  }

  return configured;
}
