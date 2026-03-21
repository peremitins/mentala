import type { TherapySessionTranscriptMessage } from '@/server/utils/therapySessionTranscriptStore';

type ChatHistoryMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string;
};

export type TherapySessionSourceMode = 'text' | 'realtime_voice';

export type ProjectedTherapySessionTranscriptMessage = {
  role: 'user' | 'assistant';
  content: string;
  turnIndex: number;
};

const REALTIME_SESSION_END_ASSISTANT_MESSAGE_MAX_CHARS = 220;

function normalizeTranscriptContent(value: string): string {
  return String(value || '').trim();
}

export function projectTherapySessionTranscriptFromHistory(params: {
  historyMessages?: ChatHistoryMessage[] | null;
  fallbackUserMessage?: string | null;
  assistantMessage?: string | null;
}): ProjectedTherapySessionTranscriptMessage[] {
  const projected = (params.historyMessages || [])
    .filter(
      (
        message
      ): message is ChatHistoryMessage & { role: 'user' | 'assistant' } =>
        message.role === 'user' || message.role === 'assistant'
    )
    .map((message) => ({
      role: message.role,
      content: normalizeTranscriptContent(message.content),
    }))
    .filter((message) => message.content.length > 0);

  // Если клиент по какой-то причине не прислал историю, не теряем текущий user-turn.
  if (
    !projected.some((message) => message.role === 'user') &&
    normalizeTranscriptContent(params.fallbackUserMessage || '').length > 0
  ) {
    projected.push({
      role: 'user',
      content: normalizeTranscriptContent(params.fallbackUserMessage || ''),
    });
  }

  const normalizedAssistantMessage = normalizeTranscriptContent(
    params.assistantMessage || ''
  );
  if (normalizedAssistantMessage) {
    const lastProjectedMessage = projected[projected.length - 1];
    if (
      !lastProjectedMessage ||
      lastProjectedMessage.role !== 'assistant' ||
      lastProjectedMessage.content !== normalizedAssistantMessage
    ) {
      projected.push({
        role: 'assistant',
        content: normalizedAssistantMessage,
      });
    }
  }

  return projected.map((message, index) => ({
    ...message,
    // Для session-end summary важен стабильный порядок всего transcript, а не старый pair-based turnIndex.
    turnIndex: index + 1,
  }));
}

export function serializeTherapySessionTranscriptForAnalysis(
  messages: TherapySessionTranscriptMessage[]
): string {
  if (!messages.length) {
    return 'Транскрипт сессии пуст.';
  }

  return messages
    .map((message, index) => {
      const roleLabel = message.role === 'assistant' ? 'ASSISTANT' : 'USER';
      const text = normalizeTranscriptContent(message.content);

      return `#${index + 1} ${roleLabel}\n${text}`;
    })
    .join('\n\n');
}

function truncateTranscriptContentForAnalysis(
  value: string,
  maxChars: number
): string {
  const normalized = normalizeTranscriptContent(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function serializeTherapySessionTranscriptForSessionEndAnalysis(params: {
  messages: TherapySessionTranscriptMessage[];
  sourceMode?: TherapySessionSourceMode;
  runtimeCompactCursorMessageId?: number | null;
}): string {
  const sourceMode = params.sourceMode || 'text';
  const cursorMessageId =
    typeof params.runtimeCompactCursorMessageId === 'number'
      ? params.runtimeCompactCursorMessageId
      : null;

  if (
    sourceMode !== 'realtime_voice' ||
    cursorMessageId === null ||
    !params.messages.length
  ) {
    return serializeTherapySessionTranscriptForAnalysis(params.messages);
  }

  const projectedMessages = params.messages
    .filter(
      (message) => message.role === 'user' || message.id > cursorMessageId
    )
    .map((message) =>
      message.role === 'assistant'
        ? {
            ...message,
            content: truncateTranscriptContentForAnalysis(
              message.content,
              REALTIME_SESSION_END_ASSISTANT_MESSAGE_MAX_CHARS
            ),
          }
        : message
    );
  const omittedAssistantTurns = params.messages.filter(
    (message) => message.role === 'assistant' && message.id <= cursorMessageId
  ).length;

  if (!projectedMessages.length) {
    return 'Транскрипт сессии пуст.';
  }

  const prelude =
    omittedAssistantTurns > 0
      ? `Realtime voice transcript projection для session-end анализа.
Все USER сообщения сохранены целиком.
ASSISTANT сообщения до последнего runtime compaction не включены дословно: их смысл уже должен быть отражён в runtime compact-state.
Пропущено ранних ASSISTANT turn-ов: ${omittedAssistantTurns}.`
      : '';

  return [
    prelude,
    serializeTherapySessionTranscriptForAnalysis(projectedMessages),
  ]
    .filter((block) => block.trim().length > 0)
    .join('\n\n');
}
