import { describe, expect, it } from 'vitest';
import { resolveSessionSummaryTranscriptStrategy } from '../server/application/chat/sessionSummaryTranscriptPolicy';

describe('session summary transcript policy', () => {
  it('использует весь transcript, даже если в сессии уже был runtime compaction', () => {
    const strategy = resolveSessionSummaryTranscriptStrategy({
      hasRuntimeCompactState: true,
      runtimeCompactCursorMessageId: 128,
    });

    expect(strategy).toBe('full_session');
  });

  it('использует весь transcript и без compaction', () => {
    const strategy = resolveSessionSummaryTranscriptStrategy({
      hasRuntimeCompactState: false,
      runtimeCompactCursorMessageId: null,
    });

    expect(strategy).toBe('full_session');
  });
});
