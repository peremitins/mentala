import { computed, onScopeDispose, ref } from 'vue';
import { nanoid } from 'nanoid';
import { useRuntimeConfig } from '#imports';
import {
  ChatModeHandoffResponseDto,
  RealtimeVoiceSessionEventResponseDto,
  RealtimeVoiceSessionEndResponseDto,
  RealtimeVoiceSessionStartResponseDto,
  type RealtimeVoiceClientPlatform,
  type RealtimeVoiceSessionEndReason,
  type RealtimeVoiceSessionEventType,
} from '@/shared/dto';
import { usePlatform } from '@/app/composables/usePlatform';
import {
  useMicPermissionGate,
  type MicPermissionState,
} from '@/app/composables/useMicPermissionGate';
import { getRealtimeVoiceSupport } from '@/app/services/realtime/realtimeVoiceBrowser';
import { RealtimeVoiceChatAdapter } from '@/app/services/realtime/realtimeVoiceChatAdapter';
import { useChatStore } from '@/app/stores/chat';
import { getCsrfTokenForHeader } from '@/app/utils/csrf';
import { RealtimeVoiceTransport } from '@/app/services/realtime/realtimeVoiceTransport';
import {
  activateRealtimeVoiceNativeAudioSession,
  deactivateRealtimeVoiceNativeAudioSession,
} from '@/app/services/realtime/realtimeVoiceNativeAudio';
import {
  startRealtimeVoiceForegroundService,
  stopRealtimeVoiceForegroundService,
} from '@/app/services/realtime/realtimeVoiceForegroundBridge';
import {
  buildRealtimeVoiceAudioConstraints,
  shouldInterruptRealtimeAssistantOnSpeechStart,
} from '@/app/services/realtime/realtimeVoicePolicy';
import {
  resolveRuntimeApiBaseUrl,
  resolveRuntimeApiUrl,
} from '@/app/utils/runtime-api';
import {
  useSceneAudioFocus,
  type SceneAudioFocusLock,
} from '@/app/composables/useSceneAudioFocus';

type RealtimeVoiceStatus =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'error';

function normalizeRealtimeUsageNumber(value: unknown): number {
  const normalized =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;

  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function extractRealtimeUsageMeta(response: any) {
  const usage = response?.usage || {};
  const inputTokens = normalizeRealtimeUsageNumber(
    usage?.input_tokens ?? usage?.prompt_tokens
  );
  const outputTokens = normalizeRealtimeUsageNumber(
    usage?.output_tokens ?? usage?.completion_tokens
  );
  const totalTokens = normalizeRealtimeUsageNumber(
    usage?.total_tokens ?? inputTokens + outputTokens
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens: normalizeRealtimeUsageNumber(
      usage?.input_tokens_details?.cached_tokens ??
        usage?.input_token_details?.cached_tokens ??
        usage?.prompt_tokens_details?.cached_tokens
    ),
    reasoningTokens: normalizeRealtimeUsageNumber(
      usage?.output_tokens_details?.reasoning_tokens ??
        usage?.output_token_details?.reasoning_tokens ??
        usage?.completion_tokens_details?.reasoning_tokens
    ),
    inputAudioTokens: normalizeRealtimeUsageNumber(
      usage?.input_tokens_details?.audio_tokens ??
        usage?.input_token_details?.audio_tokens
    ),
    outputAudioTokens: normalizeRealtimeUsageNumber(
      usage?.output_tokens_details?.audio_tokens ??
        usage?.output_token_details?.audio_tokens ??
        usage?.completion_tokens_details?.audio_tokens
    ),
  };
}

function extractRealtimeAssistantText(response: any): string {
  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const chunks: string[] = [];

  for (const item of outputItems) {
    if (item?.role !== 'assistant') {
      continue;
    }

    const contentParts = Array.isArray(item?.content) ? item.content : [];
    for (const part of contentParts) {
      const transcript =
        typeof part?.transcript === 'string' ? part.transcript.trim() : '';
      const text = typeof part?.text === 'string' ? part.text.trim() : '';
      const value = transcript || text;

      if (value) {
        chunks.push(value);
      }
    }
  }

  return chunks.join('\n').trim();
}

function extractApiErrorMessage(error: any): string {
  const userMessage =
    error?.data?.userMessage ||
    error?.data?.error?.details?.userMessage ||
    error?.response?._data?.userMessage ||
    error?.response?._data?.error?.details?.userMessage ||
    null;

  if (typeof userMessage === 'string' && userMessage.trim().length > 0) {
    return userMessage.trim();
  }

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

function extractRealtimeStartErrorReason(
  error: any
): RealtimeVoiceSessionEndReason {
  const errorCode = extractRealtimeErrorCode(error);

  if (
    errorCode === 'realtime_webrtc_handshake_network_error' ||
    errorCode === 'realtime_webrtc_handshake_timeout'
  ) {
    return 'network_error';
  }

  if (
    errorCode === 'realtime_webrtc_handshake_service_unavailable' ||
    errorCode === 'realtime_webrtc_handshake_rate_limited' ||
    errorCode === 'realtime_webrtc_handshake_invalid_response' ||
    errorCode === 'realtime_webrtc_handshake_rejected' ||
    errorCode === 'realtime_provider_init_failed'
  ) {
    return 'provider_error';
  }

  const normalized =
    `${String(error?.name || '')} ${String(error?.message || '')}`.toLowerCase();
  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network request failed') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out')
  ) {
    return 'network_error';
  }

  return 'provider_error';
}

function extractRealtimeStartErrorPayload(error: any): {
  code?: string;
  message?: string;
} | null {
  const code = extractRealtimeErrorCode(error) || undefined;
  const message = extractApiErrorMessage(error) || undefined;

  if (!code && !message) {
    return null;
  }

  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
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
    return 'Не удалось подключить голосовой чат. Попробуй ещё раз.';
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
  const micPermissionGate = useMicPermissionGate();
  const sceneAudioFocus = useSceneAudioFocus();
  const clientPlatform = ref<RealtimeVoiceClientPlatform>(getPlatform());

  const status = ref<RealtimeVoiceStatus>('idle');
  const errorMessage = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  const therapySessionId = ref<number | null>(null);
  const remainingSeconds = ref(0);
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
  let conversationItemIds = new Set<string>();
  let pendingRuntimeCompactionEventIds = new Set<string>();
  let interruptedResponseIds = new Set<string>();
  let activeResponseId: string | null = null;
  let isEnding = false;
  let readyHintMessageId: string | null = null;
  let idleTimeoutMs = 30_000;
  let realtimeSceneAudioLock: SceneAudioFocusLock | null = null;

  const isSupported = computed(() => {
    const support = getRealtimeVoiceSupport();
    return support.isSupported && support.isSecureContext;
  });
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
    conversationItemIds = new Set<string>();
    pendingRuntimeCompactionEventIds = new Set<string>();
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
    }, idleTimeoutMs);
  }

  function rememberConversationItemId(value: unknown) {
    const itemId = String(value || '').trim();
    if (!itemId) {
      return;
    }

    conversationItemIds.add(itemId);
  }

  function forgetConversationItemId(value: unknown) {
    const itemId = String(value || '').trim();
    if (!itemId) {
      return;
    }

    conversationItemIds.delete(itemId);
  }

  function applyRuntimeCompaction(params: {
    instructions: string;
    reason: string;
  }) {
    if (!transport || !transport.isConnected) {
      return;
    }

    // Сначала обновляем session.instructions, чтобы следующий turn уже шёл
    // поверх compact-state, а затем удаляем старые conversation items.
    const sessionUpdateEventId = nanoid();
    pendingRuntimeCompactionEventIds.add(sessionUpdateEventId);
    transport.sendEvent({
      event_id: sessionUpdateEventId,
      type: 'session.update',
      session: {
        instructions: params.instructions,
      },
    });

    for (const itemId of conversationItemIds) {
      const deleteEventId = nanoid();
      pendingRuntimeCompactionEventIds.add(deleteEventId);
      transport.sendEvent({
        event_id: deleteEventId,
        type: 'conversation.item.delete',
        item_id: itemId,
      });
    }

    conversationItemIds.clear();

    console.info('[RealtimeVoice] Applied runtime compaction to live session', {
      sessionId: sessionId.value,
      therapySessionId: therapySessionId.value,
      reason: params.reason,
    });
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
      const response = await realtimeApiFetch({
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
      const parsed = RealtimeVoiceSessionEventResponseDto.parse(response);

      if (parsed.runtimeCompaction) {
        applyRuntimeCompaction({
          instructions: parsed.runtimeCompaction.instructions,
          reason: parsed.runtimeCompaction.reason,
        });
      }
    } catch (error) {
      console.error('[RealtimeVoice] Failed to send session event:', error);
    }
  }

  async function finalizeSessionOnServer(
    reason: RealtimeVoiceSessionEndReason,
    options?: {
      keepalive?: boolean;
      error?: {
        code?: string;
        message?: string;
      } | null;
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
            error: options?.error || undefined,
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
          error: options?.error || undefined,
        } as Record<string, unknown>,
      });
      const parsed = RealtimeVoiceSessionEndResponseDto.parse(response);
      weeklyQuota.value = parsed.weeklyAi;

      return parsed;
    } catch (error) {
      console.error('[RealtimeVoice] Session end failed:', error);
      return null;
    }
  }

  async function finalizeTherapySessionOnServer(
    sourceTherapySessionId: number,
    options?: {
      keepalive?: boolean;
    }
  ) {
    if (
      !Number.isInteger(sourceTherapySessionId) ||
      sourceTherapySessionId <= 0
    ) {
      return null;
    }

    if (options?.keepalive) {
      try {
        await fetch(resolveRealtimeApiUrl('/api/therapy/session/end'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...buildRealtimeAppAuthHeaders({
              includeSessionToken: shouldIncludeRealtimeSessionToken(),
            }),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sourceTherapySessionId,
          }),
          keepalive: true,
        });
      } catch (error) {
        console.error(
          '[RealtimeVoice] Keepalive therapy session end failed:',
          error
        );
      }

      return null;
    }

    try {
      return await realtimeApiFetch({
        path: '/api/therapy/session/end',
        method: 'POST',
        body: {
          sessionId: sourceTherapySessionId,
        } as Record<string, unknown>,
      });
    } catch (error) {
      console.error('[RealtimeVoice] Therapy session end failed:', error);
      return null;
    }
  }

  async function handoffRealtimeSessionToText(
    reason: RealtimeVoiceSessionEndReason
  ) {
    if (!sessionId.value) {
      return null;
    }

    try {
      const response = await realtimeApiFetch({
        path: '/api/session/handoff',
        method: 'POST',
        body: {
          sourceMode: 'realtime_voice',
          targetMode: 'text',
          sourceRealtimeSessionId: sessionId.value,
          sourceRealtimeEndReason: reason,
        } as Record<string, unknown>,
      });

      return ChatModeHandoffResponseDto.parse(response);
    } catch (error) {
      console.error('[RealtimeVoice] Realtime->text handoff failed:', error);
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

    await deactivateRealtimeVoiceNativeAudioSession();
    await stopRealtimeVoiceForegroundService();
    if (realtimeSceneAudioLock) {
      await realtimeSceneAudioLock.release();
      realtimeSceneAudioLock = null;
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

    rememberConversationItemId(event.item_id);
    rememberConversationItemId(event.item?.id);

    if (event.type === 'conversation.item.deleted') {
      forgetConversationItemId(event.item_id);
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
        const transcript =
          typeof event.transcript === 'string' ? event.transcript.trim() : '';
        userSpeechStartMsByItemId.delete(itemId);

        void sendSessionEvent({
          type: 'user_turn_completed',
          metrics: {
            inputAudioSecondsDelta,
          },
          meta: {
            itemId,
            transcript,
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

        // На Android Chromium/WebView может заново перехватывать audio route.
        // На каждом assistant playback повторно закрепляем communication-mode
        // на основном динамике, не ломая duplex-захват микрофона.
        void activateRealtimeVoiceNativeAudioSession();
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

        const usageMeta = extractRealtimeUsageMeta(event.response);
        const assistantText = extractRealtimeAssistantText(event.response);
        const inputAudioTokensDelta = usageMeta.inputAudioTokens;
        const outputAudioTokensDelta = usageMeta.outputAudioTokens;
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
              assistantText,
              usage: usageMeta,
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
        const relatedClientEventId = String(event.error?.event_id || '').trim();
        if (
          relatedClientEventId &&
          pendingRuntimeCompactionEventIds.has(relatedClientEventId)
        ) {
          pendingRuntimeCompactionEventIds.delete(relatedClientEventId);
          console.warn(
            '[RealtimeVoice] Ignoring recoverable runtime compaction error',
            {
              sessionId: sessionId.value,
              relatedClientEventId,
              code: String(event.error?.code || 'unknown'),
              message: String(event.error?.message || 'Unknown realtime error'),
            }
          );
          return;
        }

        // Realtime error-события чаще recoverable и не должны ронять всю
        // voice-сессию. Фатальный разрыв мы отдельно ловим по connectionState.
        console.warn('[RealtimeVoice] Recoverable realtime provider error', {
          sessionId: sessionId.value,
          code: String(event.error?.code || 'realtime_error'),
          message: String(
            event.error?.message || 'Realtime provider returned an error'
          ),
          eventId: String(event.event_id || ''),
          relatedClientEventId,
        });
        touchActivity();
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

    const support = getRealtimeVoiceSupport();
    if (!support.isSecureContext) {
      status.value = 'error';
      errorMessage.value = `Realtime voice недоступен на небезопасном origin ${support.origin || 'unknown'}. Для микрофона в Android WebView нужен https://... или localhost.`;
      return false;
    }

    if (!support.isSupported) {
      status.value = 'error';
      errorMessage.value =
        'На этом устройстве WebRTC или доступ к микрофону недоступен.';
      return false;
    }

    status.value = 'starting';
    errorMessage.value = null;
    const priorPermissionState: MicPermissionState =
      await micPermissionGate.getPermissionState();

    const canStartCapture = await micPermissionGate.ensureCanStartCapture();
    if (!canStartCapture) {
      status.value = 'idle';
      return false;
    }

    try {
      if (!chat.sessionId) {
        chat.startSession();
      }

      await options?.onBeforeStart?.();

      const textHandoffPrepared =
        await chat.handoffTextSessionToRealtimeVoice();
      if (!textHandoffPrepared) {
        throw new Error(
          'Не удалось подготовить перенос контекста из текстового чата в голосовой режим.'
        );
      }

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
      weeklyQuota.value = parsed.weeklyAi;

      adapter = buildChatAdapter(parsed.session.therapySessionId);
      resetRuntimeMaps();
      transport = new RealtimeVoiceTransport();
      realtimeSceneAudioLock = await sceneAudioFocus.acquire('realtime-voice');
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
        onInputAudioActivity: () => {
          touchActivity();
        },
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
      await activateRealtimeVoiceNativeAudioSession();
      await startRealtimeVoiceForegroundService({
        title: 'Ментала',
        subtitle: 'Идёт голосовой разговор',
      });

      // Берём server-side idle timeout как источник истины, чтобы client stop
      // не расходился с back-end lifecycle.
      idleTimeoutMs = Math.max(1_000, parsed.session.idleTimeoutSeconds * 1000);
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
      const permissionHandled = await micPermissionGate.handleStartFailure(
        error,
        {
          priorPermissionState,
        }
      );
      errorMessage.value = permissionHandled
        ? 'Доступ к микрофону запрещён. Разреши его для Mentala и повтори попытку.'
        : extractRealtimeStartErrorMessage(error);
      const failureReason = extractRealtimeStartErrorReason(error);
      const failurePayload = extractRealtimeStartErrorPayload(error);
      await cleanupLocalTransport();

      if (sessionId.value) {
        await finalizeSessionOnServer(failureReason, {
          error: failurePayload,
        });
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
    const activeTherapySessionId = therapySessionId.value;

    try {
      await cleanupLocalTransport();
      const handoffResponse = await handoffRealtimeSessionToText(reason);

      if (!handoffResponse) {
        await finalizeSessionOnServer(reason);
      }

      // Для voice-flow дублируем клиентский сигнал завершения therapy session
      // через общий endpoint текстового чата. Серверный end идемпотентен,
      // поэтому это безопасно даже после handoff/realtime end.
      const therapySessionIdToFinalize =
        handoffResponse?.sourceTherapySessionId ?? activeTherapySessionId;
      if (typeof therapySessionIdToFinalize === 'number') {
        await finalizeTherapySessionOnServer(therapySessionIdToFinalize);
      }

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

    const activeTherapySessionId = therapySessionId.value;
    clearTimers();
    await cleanupLocalTransport();
    await finalizeSessionOnServer('page_leave', {
      keepalive: true,
    });
    if (typeof activeTherapySessionId === 'number') {
      await finalizeTherapySessionOnServer(activeTherapySessionId, {
        keepalive: true,
      });
    }
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
    weeklyQuota,
    isSupported,
    isActive,
    isBusy,
    blocksTextInput,
    showMicDeniedModal: micPermissionGate.showMicDeniedModal,
    micDeniedDialogMode: micPermissionGate.dialogMode,
    micDeniedIsStandalonePwa: micPermissionGate.isStandalonePwa,
    openMicSettings: micPermissionGate.openMicSettings,
    start,
    stop,
  };
}
