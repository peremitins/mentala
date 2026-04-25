import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

const suspendMock = vi.fn().mockResolvedValue(undefined);
const resumeMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/app/composables/useSceneAudio', () => ({
  useSceneAudio: () => ({
    suspend: suspendMock,
    resume: resumeMock,
  }),
}));

afterEach(async () => {
  const { useSceneAudioFocus } = await import(
    '../app/composables/useSceneAudioFocus'
  );
  const scope = effectScope();
  const focus = scope.run(() => useSceneAudioFocus());
  await focus?.releaseAll();
  scope.stop();
  suspendMock.mockClear();
  resumeMock.mockClear();
});

describe('scene audio focus', () => {
  it('держит реактивный lock, пока активна хотя бы одна mic/realtime-сессия', async () => {
    const { useSceneAudioFocus, useSceneAudioFocusState } = await import(
      '../app/composables/useSceneAudioFocus'
    );

    const scope = effectScope();
    const { focus, state } = scope.run(() => ({
      focus: useSceneAudioFocus(),
      state: useSceneAudioFocusState(),
    }))!;

    const firstLock = await focus.acquire('speech-dictation', {
      withFade: false,
    });
    const secondLock = await focus.acquire('realtime-voice', {
      withFade: false,
    });

    expect(state.isLocked.value).toBe(true);
    expect(state.activeLockCount.value).toBe(2);
    expect(suspendMock).toHaveBeenCalledTimes(1);
    expect(suspendMock).toHaveBeenCalledWith({ withFade: false });

    await firstLock.release();
    expect(state.isLocked.value).toBe(true);
    expect(resumeMock).not.toHaveBeenCalled();

    await secondLock.release();
    expect(state.isLocked.value).toBe(false);
    expect(resumeMock).toHaveBeenCalledTimes(1);

    scope.stop();
  });
});
