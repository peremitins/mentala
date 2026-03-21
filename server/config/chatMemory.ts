function readPositiveIntEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
}

export const CHAT_MEMORY_SOFT_INPUT_TOKENS = readPositiveIntEnv(
  process.env.CHAT_MEMORY_SOFT_INPUT_TOKENS,
  5_000
);

export const CHAT_MEMORY_MAX_INPUT_TOKENS = readPositiveIntEnv(
  process.env.CHAT_MEMORY_MAX_INPUT_TOKENS,
  6_000
);

export const CHAT_MEMORY_MAX_TURNS_PER_CHAIN = readPositiveIntEnv(
  process.env.CHAT_MEMORY_MAX_TURNS_PER_CHAIN,
  12
);

export const CHAT_HANDOFF_SUMMARY_SCHEMA_VERSION = 1;
export const CHAT_RUNTIME_COMPACT_SCHEMA_VERSION = 1;
