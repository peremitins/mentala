import { afterEach, describe, expect, it, vi } from 'vitest';

const relayRealtimeCallMock = vi.fn();
const isRelayEnabledMock = vi.fn(() => false);
const defaultRealtimeConfigMock = {
  REALTIME_VOICE_CLIENT_SECRET_TIMEOUT_MS: 60_000,
  REALTIME_VOICE_CLIENT_SECRET_TTL_SECONDS: 60,
  REALTIME_VOICE_OPENAI_MODEL: 'gpt-realtime-mini',
  REALTIME_VOICE_OPENAI_VOICE: 'alloy',
  REALTIME_VOICE_PROVIDER_TIMEOUT_MS: 60_000,
  REALTIME_VOICE_PREFIX_PADDING_MS: 300,
  REALTIME_VOICE_SILENCE_DURATION_MS: 1000,
  REALTIME_VOICE_TRANSCRIPTION_MODEL: 'gpt-4o-mini-transcribe',
  REALTIME_VOICE_TURN_DETECTION_MODE: 'semantic_vad',
  REALTIME_VOICE_TURN_THRESHOLD: 0.7,
  REALTIME_VOICE_VAD_EAGERNESS: 'low',
  REALTIME_VOICE_WEBRTC_URL: 'https://api.openai.com/v1/realtime/calls',
};
const realtimeConfigMock = {
  ...defaultRealtimeConfigMock,
};

function resetRealtimeConfigMock() {
  Object.assign(realtimeConfigMock, defaultRealtimeConfigMock);
}

vi.mock('h3', () => ({
  createError(input: { statusMessage?: string }) {
    return Object.assign(
      new Error(input.statusMessage || 'Unexpected error'),
      input
    );
  },
}));

vi.mock('@/server/config/realtime', () => realtimeConfigMock);

vi.mock('@/server/config/chatMemory', () => ({
  CHAT_MEMORY_SOFT_INPUT_TOKENS: 5_000,
}));

vi.mock('@/server/infrastructure/llm/relayClient', () => ({
  isRelayEnabled: () => isRelayEnabledMock(),
  relayRealtimeCall: (...args: any[]) => relayRealtimeCallMock(...args),
}));

describe('openai realtime SDP exchange', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    resetRealtimeConfigMock();
    relayRealtimeCallMock.mockReset();
    isRelayEnabledMock.mockReset();
    isRelayEnabledMock.mockReturnValue(false);
    delete process.env.NUXT_OPENAI_API_KEY;
  });

  it('не обрезает завершающий CRLF у SDP offer в unified WebRTC flow', async () => {
    process.env.NUXT_OPENAI_API_KEY = 'test_openai_api_key';

    const { exchangeOpenAiRealtimeWebRtcSdp } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('v=0\r\n', {
        status: 200,
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const sdpOffer = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n';

    await expect(
      exchangeOpenAiRealtimeWebRtcSdp({
        sdp: sdpOffer,
        sessionConfig: {
          type: 'realtime',
          model: 'gpt-realtime-mini',
          instructions: 'Говори кратко.',
          truncation: {
            type: 'retention_ratio',
            retention_ratio: 0.8,
            token_limits: {
              post_instructions: 5_000,
            },
          },
          audio: {
            input: {
              noise_reduction: {
                type: 'near_field',
              },
              turn_detection: {
                type: 'semantic_vad',
                eagerness: 'low',
                create_response: true,
                interrupt_response: false,
              },
              transcription: {
                model: 'gpt-4o-mini-transcribe',
              },
            },
            output: {
              voice: 'alloy',
            },
          },
        },
      })
    ).resolves.toBe('v=0\r\n');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/realtime/calls');
    expect(options.body).toBeInstanceOf(FormData);

    const sentFormData = options.body as FormData;
    expect(sentFormData.get('sdp')).toBe(sdpOffer);
    expect(sentFormData.get('session')).toContain(
      '"model":"gpt-realtime-mini"'
    );
  });

  it('по умолчанию строит realtime session config с semantic_vad low и без auto-interrupt провайдера', async () => {
    const { buildOpenAiRealtimeSessionConfig } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );

    expect(
      buildOpenAiRealtimeSessionConfig({
        instructions: 'Отвечай спокойно.',
      })
    ).toEqual({
      type: 'realtime',
      model: 'gpt-realtime-mini',
      instructions: 'Отвечай спокойно.',
      truncation: {
        type: 'retention_ratio',
        retention_ratio: 0.8,
        token_limits: {
          post_instructions: 5_000,
        },
      },
      audio: {
        input: {
          noise_reduction: {
            type: 'near_field',
          },
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'low',
            create_response: true,
            interrupt_response: false,
          },
          transcription: {
            model: 'gpt-4o-mini-transcribe',
          },
        },
        output: {
          voice: 'alloy',
        },
      },
    });
  });

  it('для iOS использует server_vad с автоматическим ответом провайдера', async () => {
    const { buildOpenAiRealtimeSessionConfig } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );

    expect(
      buildOpenAiRealtimeSessionConfig({
        instructions: 'Отвечай спокойно.',
        clientPlatform: 'ios',
      })
    ).toMatchObject({
      audio: {
        input: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.7,
            prefix_padding_ms: 300,
            silence_duration_ms: 1_000,
            create_response: true,
            interrupt_response: false,
          },
        },
      },
    });
  });

  it('для Android сохраняет semantic_vad с автоматическим ответом провайдера', async () => {
    const { buildOpenAiRealtimeSessionConfig } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );

    expect(
      buildOpenAiRealtimeSessionConfig({
        instructions: 'Отвечай спокойно.',
        clientPlatform: 'android',
      })
    ).toMatchObject({
      audio: {
        input: {
          turn_detection: {
            create_response: true,
            interrupt_response: false,
          },
        },
      },
    });
  });

  it('строит rollback-конфиг с server_vad 0.7/1000, когда режим переключён через env', async () => {
    realtimeConfigMock.REALTIME_VOICE_TURN_DETECTION_MODE = 'server_vad';

    const { buildOpenAiRealtimeSessionConfig } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );

    expect(
      buildOpenAiRealtimeSessionConfig({
        instructions: 'Отвечай спокойно.',
      })
    ).toMatchObject({
      audio: {
        input: {
          noise_reduction: {
            type: 'near_field',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.7,
            prefix_padding_ms: 300,
            silence_duration_ms: 1000,
            create_response: true,
            interrupt_response: false,
          },
        },
      },
    });
  });

  it('при включённом relay отправляет SDP handshake в relay-клиент, а не напрямую в OpenAI', async () => {
    isRelayEnabledMock.mockReturnValue(true);
    relayRealtimeCallMock.mockResolvedValue('v=0\r\n');

    const { exchangeOpenAiRealtimeWebRtcSdp } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const sdpOffer = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n';

    await expect(
      exchangeOpenAiRealtimeWebRtcSdp({
        sdp: sdpOffer,
        sessionConfig: {
          type: 'realtime',
          model: 'gpt-realtime-mini',
          instructions: 'Говори кратко.',
          truncation: {
            type: 'retention_ratio',
            retention_ratio: 0.8,
            token_limits: {
              post_instructions: 5_000,
            },
          },
          audio: {
            input: {
              noise_reduction: {
                type: 'near_field',
              },
              turn_detection: {
                type: 'semantic_vad',
                eagerness: 'low',
                create_response: true,
                interrupt_response: false,
              },
              transcription: {
                model: 'gpt-4o-mini-transcribe',
              },
            },
            output: {
              voice: 'alloy',
            },
          },
        },
      })
    ).resolves.toBe('v=0\r\n');

    expect(relayRealtimeCallMock).toHaveBeenCalledTimes(1);
    expect(relayRealtimeCallMock).toHaveBeenCalledWith({
      sdp: sdpOffer,
      clientSecret: '',
      session: expect.objectContaining({
        type: 'realtime',
        model: 'gpt-realtime-mini',
      }),
      timeoutMs: 60_000,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('классифицирует relay timeout как retryable timeout handshake failure', async () => {
    isRelayEnabledMock.mockReturnValue(true);
    relayRealtimeCallMock.mockRejectedValue(
      Object.assign(new Error('Relay request timed out'), {
        statusCode: 504,
      })
    );

    const { exchangeOpenAiRealtimeWebRtcSdp } = await import(
      '../server/infrastructure/llm/openai-realtime'
    );

    await expect(
      exchangeOpenAiRealtimeWebRtcSdp({
        sdp: 'v=0\r\n',
        sessionConfig: {
          type: 'realtime',
          model: 'gpt-realtime-mini',
          instructions: 'Говори кратко.',
          truncation: {
            type: 'retention_ratio',
            retention_ratio: 0.8,
            token_limits: {
              post_instructions: 5_000,
            },
          },
          audio: {
            input: {
              noise_reduction: {
                type: 'near_field',
              },
              turn_detection: {
                type: 'semantic_vad',
                eagerness: 'low',
                create_response: true,
                interrupt_response: false,
              },
              transcription: {
                model: 'gpt-4o-mini-transcribe',
              },
            },
            output: {
              voice: 'alloy',
            },
          },
        },
      })
    ).rejects.toMatchObject({
      statusCode: 504,
      data: expect.objectContaining({
        code: 'realtime_webrtc_handshake_timeout',
        retryable: true,
      }),
    });
  });
});
