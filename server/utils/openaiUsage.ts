type OpenAiUsageSource = Record<string, unknown>;

export type OpenAiUsageSnapshot = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number;
  reasoningTokens: number;
  inputAudioTokens: number;
  outputAudioTokens: number;
};

export type ResponsesInputTextStats = {
  itemsCount: number;
  totalTextChars: number;
  systemTextChars: number;
  developerTextChars: number;
  userTextChars: number;
  assistantTextChars: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getNestedNumber(
  source: Record<string, unknown>,
  path: string[]
): number | null {
  let current: unknown = source;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }
    current = current[segment];
  }

  return readNumber(current);
}

function pickFirstNumber(...values: Array<number | null>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function resolveUsageSource(source: unknown): OpenAiUsageSource | null {
  if (!isRecord(source)) {
    return null;
  }

  if (isRecord(source.usage)) {
    return source.usage;
  }

  if (isRecord(source.response) && isRecord(source.response.usage)) {
    return source.response.usage;
  }

  return null;
}

export function extractOpenAiUsageSnapshot(
  source: unknown
): OpenAiUsageSnapshot | null {
  const usage = resolveUsageSource(source);
  if (!usage) {
    return null;
  }

  const inputTokens = pickFirstNumber(
    getNestedNumber(usage, ['input_tokens']),
    getNestedNumber(usage, ['prompt_tokens'])
  );
  const outputTokens = pickFirstNumber(
    getNestedNumber(usage, ['output_tokens']),
    getNestedNumber(usage, ['completion_tokens'])
  );
  const totalTokens = pickFirstNumber(
    getNestedNumber(usage, ['total_tokens']),
    inputTokens !== null || outputTokens !== null
      ? (inputTokens || 0) + (outputTokens || 0)
      : null
  );
  const cachedTokens =
    pickFirstNumber(
      getNestedNumber(usage, ['input_tokens_details', 'cached_tokens']),
      getNestedNumber(usage, ['input_token_details', 'cached_tokens']),
      getNestedNumber(usage, ['prompt_tokens_details', 'cached_tokens']),
      0
    ) || 0;
  const reasoningTokens =
    pickFirstNumber(
      getNestedNumber(usage, ['output_tokens_details', 'reasoning_tokens']),
      getNestedNumber(usage, ['output_token_details', 'reasoning_tokens']),
      getNestedNumber(usage, ['completion_tokens_details', 'reasoning_tokens']),
      0
    ) || 0;
  const inputAudioTokens =
    pickFirstNumber(
      getNestedNumber(usage, ['input_tokens_details', 'audio_tokens']),
      getNestedNumber(usage, ['input_token_details', 'audio_tokens']),
      0
    ) || 0;
  const outputAudioTokens =
    pickFirstNumber(
      getNestedNumber(usage, ['output_tokens_details', 'audio_tokens']),
      getNestedNumber(usage, ['output_token_details', 'audio_tokens']),
      getNestedNumber(usage, ['completion_tokens_details', 'audio_tokens']),
      0
    ) || 0;

  const hasAnyUsage =
    inputTokens !== null ||
    outputTokens !== null ||
    totalTokens !== null ||
    cachedTokens > 0 ||
    reasoningTokens > 0 ||
    inputAudioTokens > 0 ||
    outputAudioTokens > 0;

  if (!hasAnyUsage) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
    reasoningTokens,
    inputAudioTokens,
    outputAudioTokens,
  };
}

export function describeResponsesInputText(
  input: unknown
): ResponsesInputTextStats {
  const stats: ResponsesInputTextStats = {
    itemsCount: 0,
    totalTextChars: 0,
    systemTextChars: 0,
    developerTextChars: 0,
    userTextChars: 0,
    assistantTextChars: 0,
  };

  if (!Array.isArray(input)) {
    return stats;
  }

  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }

    stats.itemsCount += 1;

    const role = typeof item.role === 'string' ? item.role : '';
    const content = Array.isArray(item.content) ? item.content : [];
    let itemTextChars = 0;

    for (const part of content) {
      if (!isRecord(part) || typeof part.text !== 'string') {
        continue;
      }

      itemTextChars += part.text.length;
    }

    stats.totalTextChars += itemTextChars;

    if (role === 'system') {
      stats.systemTextChars += itemTextChars;
      continue;
    }

    if (role === 'developer') {
      stats.developerTextChars += itemTextChars;
      continue;
    }

    if (role === 'user') {
      stats.userTextChars += itemTextChars;
      continue;
    }

    if (role === 'assistant') {
      stats.assistantTextChars += itemTextChars;
    }
  }

  return stats;
}
