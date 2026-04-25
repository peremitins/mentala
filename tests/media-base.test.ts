import { describe, expect, it } from 'vitest';
import {
  resolveAppAssetBaseUrl,
  resolveMediaBaseUrl,
} from '../app/utils/media-base';

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

describe('resolveAppAssetBaseUrl', () => {
  it('для native dev через adb reverse сохраняет localhost origin', () => {
    expect(
      resolveAppAssetBaseUrl({
        isDev: true,
        isNativeRuntime: true,
        origin: 'http://localhost:3000',
        apiBaseUrl: '',
        appUrl: 'https://local.mentala.app',
      })
    ).toBe('http://localhost:3000');
  });

  it('в native production предпочитает публичный app/api origin вместо localhost bundle origin', () => {
    expect(
      resolveAppAssetBaseUrl({
        isDev: false,
        isNativeRuntime: true,
        origin: 'http://localhost',
        apiBaseUrl: 'https://my.mentala.app',
        appUrl: 'https://my.mentala.app',
      })
    ).toBe('https://my.mentala.app');
  });

  it('для native dev c внешним dev-server сохраняет origin', () => {
    expect(
      resolveAppAssetBaseUrl({
        isDev: true,
        isNativeRuntime: true,
        platform: 'android',
        origin: 'http://192.168.0.100:3000',
        apiBaseUrl: 'https://my.mentala.app',
        appUrl: 'https://my.mentala.app',
      })
    ).toBe('http://192.168.0.100:3000');
  });

  it('для iOS native dev не отдаёт AVPlayer HTTP LAN-origin, если есть HTTPS appUrl', () => {
    expect(
      resolveAppAssetBaseUrl({
        isDev: true,
        isNativeRuntime: true,
        platform: 'ios',
        origin: 'http://192.168.0.100',
        apiBaseUrl: '',
        appUrl: 'https://local.mentala.app/',
      })
    ).toBe('https://local.mentala.app');
  });

  it('для iOS simulator сохраняет localhost-origin', () => {
    expect(
      resolveAppAssetBaseUrl({
        isDev: true,
        isNativeRuntime: true,
        platform: 'ios',
        origin: 'http://localhost:3000',
        apiBaseUrl: '',
        appUrl: 'https://local.mentala.app/',
      })
    ).toBe('http://localhost:3000');
  });
});
