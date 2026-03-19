import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadHandshakeModule() {
  vi.resetModules();
  process.env.OPENAI_REALTIME_HANDSHAKE_SECRET =
    'test_realtime_handshake_secret';

  return await import(
    '../server/application/realtime/realtime-voice-handshake-token'
  );
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.OPENAI_REALTIME_HANDSHAKE_SECRET;
});

describe('realtime voice handshake token', () => {
  it('создает и валидирует токен для конкретной realtime-сессии', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T14:00:00.000Z'));

    const {
      createRealtimeVoiceHandshakeToken,
      verifyRealtimeVoiceHandshakeToken,
    } = await loadHandshakeModule();
    const token = createRealtimeVoiceHandshakeToken({
      sessionId: 'rtv_test_1',
      userId: 42,
      expiresAt: new Date('2026-03-17T14:03:00.000Z'),
    });

    expect(
      verifyRealtimeVoiceHandshakeToken({
        token,
        sessionId: 'rtv_test_1',
      })
    ).toMatchObject({
      v: 1,
      sessionId: 'rtv_test_1',
      userId: 42,
      exp: new Date('2026-03-17T14:03:00.000Z').getTime(),
    });
  });

  it('отклоняет токен для чужой realtime-сессии', async () => {
    const {
      createRealtimeVoiceHandshakeToken,
      verifyRealtimeVoiceHandshakeToken,
    } = await loadHandshakeModule();
    const token = createRealtimeVoiceHandshakeToken({
      sessionId: 'rtv_test_1',
      userId: 42,
    });

    expect(() =>
      verifyRealtimeVoiceHandshakeToken({
        token,
        sessionId: 'rtv_test_2',
      })
    ).toThrow(/does not match session/i);
  });

  it('отклоняет протухший токен', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T14:10:00.000Z'));

    const {
      createRealtimeVoiceHandshakeToken,
      verifyRealtimeVoiceHandshakeToken,
    } = await loadHandshakeModule();
    const token = createRealtimeVoiceHandshakeToken({
      sessionId: 'rtv_test_1',
      userId: 42,
      expiresAt: new Date('2026-03-17T14:11:00.000Z'),
    });

    vi.setSystemTime(new Date('2026-03-17T14:15:00.000Z'));

    expect(() =>
      verifyRealtimeVoiceHandshakeToken({
        token,
        sessionId: 'rtv_test_1',
      })
    ).toThrow(/expired/i);
  });
});
