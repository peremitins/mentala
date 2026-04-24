import { onScopeDispose } from 'vue';
import { useSceneAudio } from '@/app/composables/useSceneAudio';

interface SceneAudioFocusAcquireOptions {
  withFade?: boolean;
}

export interface SceneAudioFocusLock {
  id: string;
  reason: string;
  release: () => Promise<void>;
}

const activeLocks = new Map<
  string,
  {
    reason: string;
    withFade: boolean;
  }
>();

let focusLockSequence = 0;
let focusOperationChain = Promise.resolve();

function enqueueFocusOperation(task: () => Promise<void>) {
  focusOperationChain = focusOperationChain.catch(() => undefined).then(task);

  return focusOperationChain;
}

async function acquireSceneAudioFocusLock(
  reason: string,
  options: SceneAudioFocusAcquireOptions = {}
): Promise<SceneAudioFocusLock> {
  const lockId = `scene-audio-focus-${++focusLockSequence}`;
  const shouldSuspend = activeLocks.size === 0;

  activeLocks.set(lockId, {
    reason,
    withFade: options.withFade !== false,
  });

  if (shouldSuspend) {
    await enqueueFocusOperation(async () => {
      if (!activeLocks.has(lockId)) {
        return;
      }

      await useSceneAudio().suspend({
        withFade: options.withFade !== false,
      });
    });
  }

  return {
    id: lockId,
    reason,
    release: async () => {
      await releaseSceneAudioFocusLock(lockId);
    },
  };
}

async function releaseSceneAudioFocusLock(lockId: string) {
  if (!activeLocks.has(lockId)) {
    return;
  }

  activeLocks.delete(lockId);

  if (activeLocks.size > 0) {
    return;
  }

  await enqueueFocusOperation(async () => {
    if (activeLocks.size > 0) {
      return;
    }

    await useSceneAudio().resume();
  });
}

export function useSceneAudioFocus() {
  const ownedLockIds = new Set<string>();

  async function acquire(
    reason: string,
    options: SceneAudioFocusAcquireOptions = {}
  ) {
    const lock = await acquireSceneAudioFocusLock(reason, options);
    ownedLockIds.add(lock.id);

    return {
      ...lock,
      release: async () => {
        if (!ownedLockIds.has(lock.id)) {
          return;
        }

        ownedLockIds.delete(lock.id);
        await lock.release();
      },
    } satisfies SceneAudioFocusLock;
  }

  async function releaseAll() {
    const lockIds = Array.from(ownedLockIds);
    ownedLockIds.clear();

    await Promise.all(
      lockIds.map((lockId) => releaseSceneAudioFocusLock(lockId))
    );
  }

  onScopeDispose(() => {
    void releaseAll();
  });

  return {
    acquire,
    releaseAll,
  };
}
