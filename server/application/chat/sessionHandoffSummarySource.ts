function hasAnyHandoffSummaryKeys(raw: Record<string, unknown>): boolean {
  return [
    'sessionOverviewShort',
    'themesActive',
    'patternsOrTriggers',
    'helpfulInterventions',
    'unfinishedThreads',
    'riskState',
    'nextSessionGuidance',
  ].some((key) => key in raw);
}

export function pickHandoffSummarySource(
  raw: Record<string, unknown>
): unknown {
  const candidates = [raw.handoff, raw.handoffSummary, raw.summary];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }

  if (hasAnyHandoffSummaryKeys(raw)) {
    // Некоторые модели возвращают handoff-summary плоско на верхнем уровне,
    // без отдельного ключа handoff.
    return raw;
  }

  return raw.handoff;
}
