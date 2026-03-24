import { createHash } from 'node:crypto';
import {
  describeResponsesInputText,
  extractOpenAiUsageSnapshot,
} from '../../utils/openaiUsage';

// В проде никогда не логируем промпты. В dev всегда показываем полный текст.
const ALLOW_PROMPT_LOGS = process.env.NODE_ENV === 'development';

export function formatPromptsForLogging(
  input: unknown
): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item, index) => {
    const role =
      item && typeof item === 'object' && 'role' in item ? item.role : '';
    const content =
      item && typeof item === 'object' && 'content' in item ? item.content : [];
    const parts = Array.isArray(content) ? content : [];
    const textContent = parts
      .map((part) => {
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .join('')
      .trim();

    const textHash = !ALLOW_PROMPT_LOGS
      ? createHash('sha256').update(textContent).digest('hex')
      : undefined;
    const textPreview = ALLOW_PROMPT_LOGS ? textContent : undefined;

    return {
      index,
      role,
      textLength: textContent.length,
      ...(textPreview ? { textPreview } : {}),
      ...(textHash ? { textHash } : {}),
    };
  });
}

export function logOpenAiRequest(params: {
  label: string;
  scope: string;
  model: string;
  input: unknown;
  userId?: number | string;
  sessionId?: string;
  extra?: Record<string, unknown>;
}) {
  console.log(params.label, {
    scope: params.scope,
    model: params.model,
    userId: params.userId ?? 'unknown',
    sessionId: params.sessionId || 'none',
    ...(params.extra || {}),
    prompts: formatPromptsForLogging(params.input),
  });
}

export function logOpenAiUsage(params: {
  scope: string;
  model: string;
  input: unknown;
  usageSource: unknown;
  latencyMs: number;
  outputTextChars?: number;
  userId?: number | string;
  sessionId?: string;
  extra?: Record<string, unknown>;
}) {
  const inputStats = describeResponsesInputText(params.input);
  const usage = extractOpenAiUsageSnapshot(params.usageSource);

  console.info('[OpenAI usage]', {
    scope: params.scope,
    model: params.model,
    userId: params.userId ?? 'unknown',
    sessionId: params.sessionId || 'none',
    latencyMs: params.latencyMs,
    inputItems: inputStats.itemsCount,
    inputTextChars: inputStats.totalTextChars,
    systemTextChars: inputStats.systemTextChars,
    developerTextChars: inputStats.developerTextChars,
    userTextChars: inputStats.userTextChars,
    assistantTextChars: inputStats.assistantTextChars,
    outputTextChars:
      typeof params.outputTextChars === 'number'
        ? params.outputTextChars
        : null,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    cachedTokens: usage?.cachedTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    inputAudioTokens: usage?.inputAudioTokens ?? 0,
    outputAudioTokens: usage?.outputAudioTokens ?? 0,
    usageAvailable: Boolean(usage),
    ...(params.extra || {}),
  });
}
