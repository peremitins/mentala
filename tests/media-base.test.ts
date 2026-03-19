import { describe, expect, it } from 'vitest';
import { resolveMediaBaseUrl } from '../app/utils/media-base';

describe('resolveMediaBaseUrl', () => {
  it('для native local bundle в dev выбирает apiBase вместо localhost origin', () => {
    expect(
      resolveMediaBaseUrl({
        isDev: true,
        isNativeRuntime: true,
        origin: 'http://localhost',
        apiBaseUrl: 'http://192.168.0.100:3000',
        mediaBaseUrl: '',
      })
    ).toBe('http://192.168.0.100:3000');
  });

  it('для внешнего dev-server origin сохраняет origin как источник медиа', () => {
    expect(
      resolveMediaBaseUrl({
        isDev: true,
        isNativeRuntime: true,
        origin: 'http://192.168.0.100:3000',
        apiBaseUrl: 'http://10.0.2.2:3000',
        mediaBaseUrl: '',
      })
    ).toBe('http://192.168.0.100:3000');
  });

  it('в production предпочитает mediaBaseUrl', () => {
    expect(
      resolveMediaBaseUrl({
        isDev: false,
        isNativeRuntime: true,
        origin: 'http://localhost',
        apiBaseUrl: 'http://192.168.0.100:3000',
        mediaBaseUrl: 'https://cdn.mentala.app',
      })
    ).toBe('https://cdn.mentala.app');
  });
});
