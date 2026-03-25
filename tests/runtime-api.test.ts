import { describe, expect, it } from 'vitest';
import { resolveRuntimeApiBaseUrl } from '../app/utils/runtime-api';

describe('runtime api base resolver', () => {
  it('на native local bundle оставляет backend apiBase, а не localhost origin', () => {
    expect(
      resolveRuntimeApiBaseUrl({
        apiBase: 'https://api.mentala.test',
        isDev: true,
        appOrigin: 'http://localhost',
        isCapacitor: true,
        platform: 'android',
      })
    ).toBe('https://api.mentala.test');
  });

  it('на external native dev-server использует origin приложения', () => {
    expect(
      resolveRuntimeApiBaseUrl({
        apiBase: 'https://api.mentala.test',
        isDev: true,
        appOrigin: 'http://192.168.1.15:3000',
        isCapacitor: true,
        platform: 'android',
      })
    ).toBe('http://192.168.1.15:3000');
  });

  it('не использует не-http ios origin как api base', () => {
    expect(
      resolveRuntimeApiBaseUrl({
        apiBase: 'https://api.mentala.test',
        isDev: true,
        appOrigin: 'capacitor://localhost',
        isCapacitor: true,
        platform: 'ios',
      })
    ).toBe('https://api.mentala.test');
  });
});
