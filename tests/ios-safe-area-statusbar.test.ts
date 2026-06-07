import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function readJson<T>(path: string): T {
  return JSON.parse(readProjectFile(path)) as T;
}

describe('iOS safe-area и status bar', () => {
  it('держит native WebView под прозрачным status bar', () => {
    const capacitorConfigSource = readProjectFile('capacitor.config.ts');
    const statusBarConfigPattern =
      /StatusBar:\s*{[\s\S]*?overlaysWebView:\s*true[\s\S]*?}/;

    expect(capacitorConfigSource).toMatch(statusBarConfigPattern);

    const iosConfig = readJson<{
      plugins?: { StatusBar?: { overlaysWebView?: boolean } };
    }>('ios/App/App/capacitor.config.json');
    const androidConfig = readJson<{
      plugins?: { StatusBar?: { overlaysWebView?: boolean } };
    }>('android/app/src/main/assets/capacitor.config.json');

    expect(iosConfig.plugins?.StatusBar?.overlaysWebView).toBe(true);
    expect(androidConfig.plugins?.StatusBar?.overlaysWebView).toBe(true);
  });

  it('разрешает установленной iOS PWA рисовать обои под status bar', () => {
    const nuxtConfigSource = readProjectFile('nuxt.config.ts');

    expect(nuxtConfigSource).toContain("name: 'apple-mobile-web-app-capable'");
    expect(nuxtConfigSource).toContain("content: 'yes'");
    expect(nuxtConfigSource).toContain(
      "name: 'apple-mobile-web-app-status-bar-style'"
    );
    expect(nuxtConfigSource).toContain("content: 'black-translucent'");
  });

  it('не кладёт realtime-свечение поверх нижней навигации', () => {
    const frameSource = readProjectFile(
      'app/components/realtime/RealtimeVoiceAmbientFrame.vue'
    );

    expect(frameSource).toMatch(/\.rt-ambient-frame\s*{[\s\S]*z-index:\s*9;/);
    expect(frameSource).toContain('margin: var(--safe-area-inset-top)');
    expect(frameSource).toMatch(/0px\s+var\(--safe-area-inset-left\)/);
    expect(frameSource).not.toContain('env(safe-area-inset-bottom');
  });
});
