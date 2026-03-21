function hasAnyDurableUserMemoryKeys(raw: Record<string, unknown>): boolean {
  return [
    'schemaVersion',
    'v',
    'name',
    'n',
    'facts',
    'f',
    'preferences',
    'p',
    'context',
    'g',
  ].some((key) => key in raw);
}

export function pickDurableUserMemorySource(
  raw: Record<string, unknown>
): unknown {
  const candidates = [raw.profile, raw.durableUserMemory];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }

  if (hasAnyDurableUserMemoryKeys(raw)) {
    return raw;
  }

  return raw.profile;
}
