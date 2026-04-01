export type SessionSummaryTranscriptStrategy = 'full_session' | 'after_cursor';

export function resolveSessionSummaryTranscriptStrategy(params: {
  hasRuntimeCompactState: boolean;
  runtimeCompactCursorMessageId: number | null | undefined;
}): SessionSummaryTranscriptStrategy {
  void params;

  // Для session-end summary и durable profile update нельзя ограничиваться
  // хвостом после последнего compaction cursor. Иначе устойчивые факты из ранних
  // turn-ов сессии пропадают из summary pipeline и в user_memory_profiles
  // попадает только недавний фрагмент разговора.
  return 'full_session';
}
