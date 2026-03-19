import { computed, onScopeDispose, ref } from 'vue';
import { nanoid } from 'nanoid';
import { useRuntimeConfig } from '#imports';
import {
  RealtimeVoiceSessionEndResponseDto,
  RealtimeVoiceSessionStartResponseDto,
  type RealtimeVoiceClientPlatform,
  type RealtimeVoiceSessionEndReason,
  type RealtimeVoiceSessionEventType,
} from '@/shared/dto';
import { usePlatform } from '@/app/composables/usePlatform';
import { getRealtimeVoiceSupport } from '@/app/services/realtime/realtimeVoiceBrowser';
import { RealtimeVoiceChatAdapter } from '@/app/services/realtime/realtimeVoiceChatAdapter';
import { useChatStore } from '@/app/stores/chat';
import { getCsrfTokenForHeader } from '@/app/utils/csrf';
import { RealtimeVoiceTransport } from '@/app/services/realtime/realtimeVoiceTransport';
import {
  buildRealtimeVoiceAudioConstraints,
  shouldInterruptRealtimeAssistantOnSpeechStart,
} from '@/app/services/realtime/realtimeVoicePolicy';
import {
  resolveRuntimeApiBaseUrl,
  resolveRuntimeApiUrl,
} from '@/app/utils/runtime-api';

type RealtimeVoiceStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'error';

function extractApiErrorMessage(error: any): string {
  const payloadCode =
    error?.data?.code ||
    error?.data?.error?.code ||
    error?.response?._data?.code ||
    error?.response?._data?.error?.code ||
    null;
  if (payloadCode === 'realtime_provider_init_failed') {
    return 'OpenAI realtime не принял конфигурацию сессии. Провайдер не инициализировался.';
  }

  const payloadMessage =
    error?.data?.message ||
    error?.data?.error?.message ||
    error?.response?._data?.message ||
    error?.response?._data?.error?.message ||
    null;

  if (typeof payloadMessage === 'string' && payloadMessage.trim().length > 0) {
    return payloadMessage.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return 'Не удалось запустить голосовую сессию';
}

function extractEmbeddedJsonMessage(value: string): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const jsonStartIndex = normalized.indexOf('{');
  if (jsonStartIndex === -1) {
    return null;
  }

  try {
    const payload = JSON.parse(normalized.slice(jsonStartIndex));
    const payloadMessage =
      payload?.statusMessage ||
      payload?.message ||
      payload?.data?.message ||
      null;
    return typeof payloadMessage === 'string' &&
      payloadMessage.trim().length > 0
      ? payloadMessage.trim()
      : null;
  } catch {
    return null;
  }
}

function extractEmbeddedJsonPayload(value: string): Record<string, any> | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const jsonStartIndex = normalized.indexOf('{');
  if (jsonStartIndex === -1) {
    return null;
  }

  try {
    return JSON.parse(normalized.slice(jsonStartIndex));
  } catch {
    return null;
  }
}

function extractRealtimeErrorCode(error: any): string | null {
  const explicitCode =
    error?.data?.code ||
    error?.data?.error?.code ||
    error?.response?._data?.code ||
    error?.response?._data?.error?.code ||
    null;

  if (typeof explicitCode === 'string' && explicitCode.trim().length > 0) {
    return explicitCode.trim();
  }

  const embeddedPayload = extractEmbeddedJsonPayload(
    String(error?.message || '')
  );
  const embeddedCode =
    embeddedPayload?.data?.code ||
    embeddedPayload?.error?.code ||
    embeddedPayload?.code ||
    null;

  return typeof embeddedCode === 'string' && embeddedCode.trim().length > 0
    ? embeddedCode.trim()
    : null;
}

function extractRealtimeStartErrorMessage(error: any): string {
  const errorName = String(error?.name || '');
  const message = String(error?.message || '');
  const normalized = `${errorName} ${message}`.toLowerCase();

  const errorCode = extractRealtimeErrorCode(error);
  if (errorCode === 'realtime_backend_region_unsupported') {
    return 'Realtime voice недоступен в текущем web-окружении. Web сейчас идёт через серверный регион, который OpenAI Realtime не поддерживает.';
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed') ||
    normalized.includes('load failed') ||
    normalized.includes('networkerror when attempting to fetch resource') ||
    normalized.includes('network request failed')
  ) {
    return 'Не удалось подключить голосовой чат. Проверь соединение и попробуй ещё раз.';
  }

  const apiMessage = extractApiErrorMessage(error);
  if (
    apiMessage !== 'Не удалось запустить голосовую сессию' &&
    apiMessage.trim().length > 0
  ) {
    return apiMessage;
  }

  if (
    normalized.includes('notallowederror') ||
    normalized.includes('permission denied') ||
    normalized.includes('permission dismissed')
  ) {
    return 'Доступ к микрофону запрещён. Разреши микрофон для Mentala в настройках браузера или приложения.';
  }

  if (
    normalized.includes('notfounderror') ||
    normalized.includes('requested device not found') ||
    normalized.includes('devicesnotfounderror')
  ) {
    return 'На устройстве не найден доступный микрофон.';
  }

  if (
    normalized.includes('notreadableerror') ||
    normalized.includes('trackstarterror') ||
    normalized.includes('could not start audio source')
  ) {
    return 'Микрофон сейчас недоступен или занят другим приложением.';
  }

  if (
    normalized.includes('realtime voice is not supported') ||
    normalized.includes('peer connection api is unavailable') ||
    normalized.includes('microphone api is unavailable')
  ) {
    return 'В текущем WebView недоступны API WebRTC или захвата микрофона.';
  }

  if (normalized.includes('realtime webrtc handshake failed')) {
    const embeddedMessage = extractEmbeddedJsonMessage(message);
    if (embeddedMessage) {
      return `Не удалось установить realtime WebRTC-соединение: ${embeddedMessage}`;
    }

    return 'Не удалось установить realtime WebRTC-соединение с OpenAI.';
  }

  return 'Не удалось запустить голосовую сессию';
}

function buildRealtimeAppAuthHeaders(options?: {
  includeSessionToken?: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options?.includeSessionToken) {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('mentai.session.token')
        : null;
    if (token) {
      headers['X-Session-Token'] = token;
    }
  }

  const csrf = getCsrfTokenForHeader();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  return headers;
}

export function useRealtimeVoiceSession(options?: {
  onBeforeStart?: () => Promise<void> | void;
  onAfterStop?: (reason: RealtimeVoiceSessionEndReason) => Promise<void> | void;
  getReadyMessageText?: () => string | null | undefined;
}) {
  const runtimeConfig = useRuntimeConfig();
  const chat = useChatStore();
  const { getPlatform } = usePlatform();
  const clientPlatform = ref<RealtimeVoiceClientPlatform>(getPlatform());

  const status = ref<RealtimeVoiceStatus>('idle');
  const errorMessage = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  const therapySessionId = ref<number | null>(null);
  const remainingSeconds = ref(0);
  const monthlyQuota = ref<{
    limitMinutes: number;
    usedMinutes: number;
    remainingMinutes: number;
    resetsAt: string;
  } | null>(null);
  const weeklyQuota = ref<{
    weeklyLimitMinutes: number;
    usedMinutes: number;
    availableMinutes: number;
    nextResetAt: string | null;
  } | null>(null);

  let transport: RealtimeVoiceTransport | null = null;
  let adapter: RealtimeVoiceChatAdapter | null = null;
  let hardStopTimer: ReturnType<typeof setTimeout> | null = null;
  let idleStopTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let startedAtMs = 0;
  let maxDurationSeconds = 0;
  let userSpeechStartMsByItemId = new Map<string, number>();
  let assistantAudioStartedAtMsByResponseId = new Map<string, number>();
  let assistantAudioSecondsByResponseId = new Map<string, number>();
  let interruptedResponseIds = new Set<string>();
  let activeResponseId: string | null = null;
  let isEnding = false;
  let readyHintMessageId: string | null = null;

  const isSupported = computed(() => getRealtimeVoiceSupport().isSupported);
  const isActive = computed(() => status.value === 'active');
  const isBusy = computed(
    () => status.value === 'starting' || status.value === 'stopping'
  );
  const blocksTextInput = computed(
    () =>
      status.value === 'starting' ||
      status.value === 'active' ||
      status.value === 'stopping'
  );

  function resolveRealtimeApiBase() {
    const platform = getPlatform();

    return resolveRuntimeApiBaseUrl({
      apiBase:
        (runtimeConfig.public as any).realtimeApiBase ||
        (runtimeConfig.public as any).apiBase,
      isDev: (runtimeConfig.public as any).isDev === true,
      appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      isCapacitor: platform !== 'web',
      platform,
    });
  }

  function resolveRealtimeApiUrl(path: string) {
    const platform = getPlatform();

    return resolveRuntimeApiUrl(path, {
      apiBase:
        (runtimeConfig.public as any).realtimeApiBase ||
        (runtimeConfig.public as any).apiBase,
      isDev: (runtimeConfig.public as any).isDev === true,
      appOrigin: typeof window !== 'undefined' ? window.location.origin : '',
      isCapacitor: platform !== 'web',
      platform,
    });
  }

  function shouldIncludeRealtimeSessionToken() {
    const platform = getPlatform();
    if (platform !== 'web') {
      return true;
    }

    if (typeof window === 'undefined') {
      return false;
    }

    const realtimeApiBase = resolveRealtimeApiBase();
    return (
      realtimeApiBase.length > 0 && realtimeApiBase !== window.location.origin
    );
  }

  async function realtimeApiFetch<T>(params: {
    path: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
    keepalive?: boolean;
  }): Promise<T> {
    const response = await fetch(resolveRealtimeApiUrl(params.path), {
      method: params.method,
      credentials: 'include',
      headers: {
        ...buildRealtimeAppAuthHeaders({
          includeSessionToken: shouldIncludeRealtimeSessionToken(),
        }),
        'Content-Type': 'application/json',
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
      ...(params.keepalive ? { keepalive: true } : {}),
    });

    const rawText = await response.text();
    const trimmedText = rawText.trim();
    const payload = (() => {
      if (!trimmedText) {
        return null;
      }

      try {
        return JSON.parse(trimmedText);
      } catch {
        return {
          message: trimmedText,
        };
      }
    })();

    if (!response.ok) {
      const errorMessage =
        payload?.message ||
        payload?.error?.message ||
        response.statusText ||
        'Realtime request failed';
      const error = new Error(String(errorMessage));

      Object.assign(error, {
        status: response.status,
        data: payload,
        response: {
          status: response.status,
          _data: payload,
        },
      });

      throw error;
    }

    return payload as T;
  }

  function clearTimers() {
    if (hardStopTimer) {
      clearTimeout(hardStopTimer);
      hardStopTimer = null;
    }
    if (idleStopTimer) {
      clearTimeout(idleStopTimer);
      idleStopTimer = null;
    }
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function resetRuntimeMaps() {
    userSpeechStartMsByItemId = new Map<string, number>();
    assistantAudioStartedAtMsByResponseId = new Map<string, number>();
    assistantAudioSecondsByResponseId = new Map<string, number>();
    interruptedResponseIds = new Set<string>();
    activeResponseId = null;
  }

  function removeReadyHintMessage() {
    if (!readyHintMessageId) {
      return;
    }

    chat.removeMessage(readyHintMessageId);
    readyHintMessageId = null;
  }

  function showReadyHintMessage(voiceTherapySessionId: number) {
    const content = String(options?.getReadyMessageText?.() || '').trim();
    if (!content) {
      return;
    }

    removeReadyHintMessage();
    readyHintMessageId = chat.addRuntimeMessage({
      role: 'assistant',
      content,
      therapySessionId: voiceTherapySessionId,
      transient: true,
      source: 'realtime',
      feedbackDisabled: true,
    });
  }

  function updateRemainingSeconds() {
    if (!startedAtMs || maxDurationSeconds <= 0) {
      remainingSeconds.value = 0;
      return;
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - startedAtMs) / 1000)
    );
    remainingSeconds.value = Math.max(0, maxDurationSeconds - elapsedSeconds);
  }

  function startCountdown(maxSeconds: number) {
    maxDurationSeconds = maxSeconds;
    startedAtMs = Date.now();
    updateRemainingSeconds();

    countdownTimer = setInterval(() => {
      updateRemainingSeconds();
    }, 1_000);

    hardStopTimer = setTimeout(() => {
      void stop('timeout');
    }, maxSeconds * 1000);
  }

  function touchActivity() {
    if (status.value !== 'active') {
      return;
    }

    if (idleStopTimer) {
      clearTimeout(idleStopTimer);
    }

    idleStopTimer = setTimeout(() => {
      void stop('timeout');
    }, 30_000);
  }

  async function sendSessionEvent(params: {
    type: RealtimeVoiceSessionEventType;
    metrics?: {
      inputAudioSecondsDelta?: number;
      outputAudioSecondsDelta?: number;
      inputAudioTokensDelta?: number;
      outputAudioTokensDelta?: number;
    };
    error?: {
      code?: string;
      message?: string;
    } | null;
    meta?: Record<string, unknown>;
  }) {
    if (!sessionId.value) {
      return;
    }

    try {
      await realtimeApiFetch({
        path: '/api/realtime/session/event',
        method: 'POST',
        body: {
          sessionId: sessionId.value,
          eventId: nanoid(),
          type: params.type,
          at: new Date().toISOString(),
          metrics: params.metrics,
          error: params.error,
          meta: params.meta,
        } as Record<string, unknown>,
      });
    } catch (error) {
      console.error('[RealtimeVoice] Failed to send session event:', error);
    }
  }

  async function finalizeSessionOnServer(
    reason: RealtimeVoiceSessionEndReason,
    options?: {
      keepalive?: boolean;
    }
  ) {
    if (!sessionId.value) {
      return null;
    }

    const currentSessionId = sessionId.value;

    if (options?.keepalive) {
      try {
        await fetch(resolveRealtimeApiUrl('/api/realtime/session/end'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...buildRealtimeAppAuthHeaders({
              includeSessionToken: shouldIncludeRealtimeSessionToken(),
            }),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            reason,
          }),
          keepalive: true,
        });
      } catch (error) {
        console.error('[RealtimeVoice] Keepalive session end failed:', error);
      }

      return null;
    }

    try {
      const response = await realtimeApiFetch({
        path: '/api/realtime/session/end',
        method: 'POST',
        body: {
          sessionId: currentSessionId,
          reason,
        } as Record<string, unknown>,
      });
      const parsed = RealtimeVoiceSessionEndResponseDto.parse(response);
      monthlyQuota.value = parsed.quota;
      weeklyQuota.value = parsed.weeklyAi;

      return parsed;
    } catch (error) {
      console.error('[RealtimeVoice] Session end failed:', error);
      return null;
    }
  }

  async function cleanupLocalTransport() {
    clearTimers();
    removeReadyHintMessage();

    adapter?.pruneEmptyMessages();

    if (transport) {
      await transport.stop();
      transport = null;
    }

    adapter = null;
    resetRuntimeMaps();
    startedAtMs = 0;
    maxDurationSeconds = 0;
    remainingSeconds.value = 0;
  }

  function buildChatAdapter(voiceTherapySessionId: number) {
    return new RealtimeVoiceChatAdapter(
      {
        createMessage: (params) =>
          chat.addRuntimeMessage({
            role: params.role,
            content: params.content || '',
            therapySessionId: params.therapySessionId,
            transient: true,
            source: 'realtime',
            feedbackDisabled: params.feedbackDisabled,
            realtimeTurnId: params.realtimeTurnId,
          }),
        appendContent: (messageId, delta) =>
          chat.appendMessageContent(messageId, delta),
        replaceContent: (messageId, content) =>
          chat.replaceMessageContent(messageId, content),
        patchMessage: (messageId, patch) => chat.patchMessage(messageId, patch),
        removeMessage: (messageId) => chat.removeMessage(messageId),
      },
      voiceTherapySessionId
    );
  }

  function handleRealtimeServerEvent(event: {
    type?: string;
    [key: string]: any;
  }) {
    if (typeof event.type !== 'string') {
      return;
    }

    adapter?.handleServerEvent(event);

    switch (event.type) {
      case 'input_audio_buffer.speech_started': {
        removeReadyHintMessage();
        const itemId = String(event.item_id || '');
        const audioStartMs = Number(event.audio_start_ms || 0);
        if (itemId) {
          userSpeechStartMsByItemId.set(itemId, audioStartMs);
        }

        const currentActiveResponseId = activeResponseId;
        const shouldInterruptResponse =
          currentActiveResponseId &&
          transport &&
          shouldInterruptRealtimeAssistantOnSpeechStart({
            platform: clientPlatform.value,
            activeResponseId: currentActiveResponseId,
            wasAlreadyInterrupted: interruptedResponseIds.has(
              currentActiveResponseId
            ),
            isAssistantAudioPlaying: assistantAudioStartedAtMsByResponseId.has(
              currentActiveResponseId
            ),
          });

        if (shouldInterruptResponse && currentActiveResponseId && transport) {
          interruptedResponseIds.add(currentActiveResponseId);
          adapter?.finalizeAssistantResponse(currentActiveResponseId);
          transport.interrupt(currentActiveResponseId);
          void sendSessionEvent({
            type: 'interrupted',
            meta: {
              responseId: currentActiveResponseId,
              platform: clientPlatform.value,
            },
          });
        }

        touchActivity();
        return;
      }

      case 'input_audio_buffer.speech_stopped': {
        const itemId = String(event.item_id || '');
        const audioEndMs = Number(event.audio_end_ms || 0);
        const audioStartMs =
          userSpeechStartMsByItemId.get(itemId) ?? audioEndMs;
        const deltaSeconds = Math.max(
          0,
          Math.round((audioEndMs - audioStartMs) / 1000)
        );

        if (itemId) {
          userSpeechStartMsByItemId.set(itemId, deltaSeconds);
        }

        touchActivity();
        return;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = String(event.item_id || '');
        const storedValue = userSpeechStartMsByItemId.get(itemId) ?? 0;
        const inputAudioSecondsDelta = Number.isFinite(storedValue)
          ? Math.max(0, Math.floor(storedValue))
          : 0;
        userSpeechStartMsByItemId.delete(itemId);

        void sendSessionEvent({
          type: 'user_turn_completed',
          metrics: {
            inputAudioSecondsDelta,
          },
          meta: {
            itemId,
          },
        });
        touchActivity();
        return;
      }

      case 'response.created': {
        const responseId = String(event.response?.id || '');
        if (!responseId) {
          return;
        }

        activeResponseId = responseId;
        interruptedResponseIds.delete(responseId);
        assistantAudioSecondsByResponseId.set(responseId, 0);

        void sendSessionEvent({
          type: 'response_started',
          meta: {
            responseId,
          },
        });
        touchActivity();
        return;
      }

      case 'output_audio_buffer.started': {
        const responseId = String(event.response_id || '');
        if (!responseId) {
          return;
        }

        assistantAudioStartedAtMsByResponseId.set(
          responseId,
          performance.now()
        );
        touchActivity();
        return;
      }

      case 'output_audio_buffer.stopped': {
        const responseId = String(event.response_id || '');
        if (!responseId) {
          return;
        }

        const startedAt = assistantAudioStartedAtMsByResponseId.get(responseId);
        if (typeof startedAt === 'number') {
          const deltaSeconds = Math.max(
            0,
            Math.round((performance.now() - startedAt) / 1000)
          );
          const currentValue =
            assistantAudioSecondsByResponseId.get(responseId) ?? 0;
          assistantAudioSecondsByResponseId.set(
            responseId,
            currentValue + deltaSeconds
          );
        }
        assistantAudioStartedAtMsByResponseId.delete(responseId);
        touchActivity();
        return;
      }

      case 'response.done': {
        const responseId = String(event.response?.id || '');
        if (!responseId) {
          return;
        }

        const inputAudioTokensDelta = Math.max(
          0,
          Number(event.response?.usage?.input_token_details?.audio_tokens || 0)
        );
        const outputAudioTokensDelta = Math.max(
          0,
          Number(event.response?.usage?.output_token_details?.audio_tokens || 0)
        );
        const outputAudioSecondsDelta =
          assistantAudioSecondsByResponseId.get(responseId) ?? 0;

        assistantAudioStartedAtMsByResponseId.delete(responseId);
        assistantAudioSecondsByResponseId.delete(responseId);

        if (event.response?.status === 'failed') {
          void sendSessionEvent({
            type: 'failed',
            error: {
              code: 'response_failed',
              message: 'Провайдер завершил ответ с ошибкой',
            },
            meta: {
              responseId,
            },
          });
          void stop('provider_error');
          return;
        }

        if (adapter?.hasAssistantMessage(responseId)) {
          void sendSessionEvent({
            type: 'response_completed',
            metrics: {
              outputAudioSecondsDelta,
              inputAudioTokensDelta,
              outputAudioTokensDelta,
            },
            meta: {
              responseId,
              status: event.response?.status || 'completed',
            },
          });
        }

        if (activeResponseId === responseId) {
          activeResponseId = null;
        }
        touchActivity();
        return;
      }

      case 'error': {
        void sendSessionEvent({
          type: 'failed',
          error: {
            code: String(event.error?.code || 'realtime_error'),
            message: String(
              event.error?.message || 'Realtime provider returned an error'
            ),
          },
        });
        void stop('provider_error');
        return;
      }

      default: {
        if (
          event.type === 'conversation.item.input_audio_transcription.delta' ||
          event.type === 'response.audio_transcript.delta' ||
          event.type === 'response.audio_transcript.done' ||
          event.type === 'response.output_item.added'
        ) {
          touchActivity();
        }
      }
    }
  }

  async function start() {
    if (isBusy.value || isActive.value) {
      return false;
    }

    if (!isSupported.value) {
      const support = getRealtimeVoiceSupport();
      status.value = 'error';
      errorMessage.value =
        !support.isSecureContext && !support.hasUserMedia
          ? `Realtime voice недоступен на небезопасном origin ${support.origin || 'unknown'}. Для микрофона в Android WebView нужен https://... или localhost.`
          : 'На этом устройстве WebRTC или доступ к микрофону недоступен.';
      return false;
    }

    status.value = 'starting';
    errorMessage.value = null;

    try {
      if (!chat.sessionId) {
        chat.startSession();
      }

      await options?.onBeforeStart?.();

      const response = await realtimeApiFetch({
        path: '/api/realtime/session',
        method: 'POST',
        body: {
          entryContext: chat.entryContext,
          chatSessionId: chat.sessionId,
          clientPlatformHint: getPlatform(),
        } as Record<string, unknown>,
      });
      const parsed = RealtimeVoiceSessionStartResponseDto.parse(response);

      sessionId.value = parsed.session.id;
      therapySessionId.value = parsed.session.therapySessionId;
      clientPlatform.value = parsed.session.clientPlatform;
      monthlyQuota.value = parsed.quota;
      weeklyQuota.value = parsed.weeklyAi;

      adapter = buildChatAdapter(parsed.session.therapySessionId);
      resetRuntimeMaps();
      transport = new RealtimeVoiceTransport();
      await transport.start({
        clientSecret: parsed.openai.clientSecret || null,
        webrtcUrl: parsed.openai.webrtcUrl,
        audioConstraints: buildRealtimeVoiceAudioConstraints(
          parsed.session.clientPlatform
        ),
        requestHeaders: buildRealtimeAppAuthHeaders({
          includeSessionToken: getPlatform() !== 'web',
        }),
        onEvent: handleRealtimeServerEvent,
        onConnectionStateChange: (connectionState) => {
          if (
            (connectionState === 'failed' || connectionState === 'closed') &&
            status.value !== 'stopping' &&
            status.value !== 'idle'
          ) {
            void stop('network_error');
          }
        },
      });

      status.value = 'active';
      touchActivity();
      startCountdown(parsed.session.maxDurationSeconds);
      showReadyHintMessage(parsed.session.therapySessionId);
      void sendSessionEvent({
        type: 'started',
        meta: {
          clientPlatform: parsed.session.clientPlatform,
        },
      });

      return true;
    } catch (error: any) {
      errorMessage.value = extractRealtimeStartErrorMessage(error);
      await cleanupLocalTransport();

      if (sessionId.value) {
        await finalizeSessionOnServer('network_error');
      }

      sessionId.value = null;
      therapySessionId.value = null;
      status.value = 'error';
      return false;
    }
  }

  async function stop(reason: RealtimeVoiceSessionEndReason = 'user_stop') {
    if (status.value === 'idle' || isEnding) {
      return;
    }

    isEnding = true;
    status.value = 'stopping';

    try {
      await cleanupLocalTransport();
      await finalizeSessionOnServer(reason);
      await options?.onAfterStop?.(reason);

      if (reason === 'network_error' || reason === 'provider_error') {
        status.value = 'error';
        if (!errorMessage.value) {
          errorMessage.value =
            reason === 'network_error'
              ? 'Соединение голосовой сессии потеряно.'
              : 'Голосовая сессия завершилась из-за ошибки провайдера.';
        }
      } else {
        status.value = 'idle';
        errorMessage.value = null;
      }
    } finally {
      sessionId.value = null;
      therapySessionId.value = null;
      isEnding = false;
    }
  }

  async function handlePageLeave() {
    if (!sessionId.value || status.value === 'idle') {
      return;
    }

    clearTimers();
    await cleanupLocalTransport();
    await finalizeSessionOnServer('page_leave', {
      keepalive: true,
    });
    sessionId.value = null;
    therapySessionId.value = null;
    status.value = 'idle';
  }

  if (typeof window !== 'undefined') {
    const handlePageHide = () => {
      void handlePageLeave();
    };

    window.addEventListener('pagehide', handlePageHide);

    onScopeDispose(() => {
      window.removeEventListener('pagehide', handlePageHide);
      void handlePageLeave();
    });
  } else {
    onScopeDispose(() => {
      clearTimers();
    });
  }

  return {
    status,
    errorMessage,
    sessionId,
    therapySessionId,
    remainingSeconds,
    monthlyQuota,
    weeklyQuota,
    isSupported,
    isActive,
    isBusy,
    blocksTextInput,
    start,
    stop,
  };
}
