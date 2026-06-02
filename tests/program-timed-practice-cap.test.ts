import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('program timed practice cap', () => {
  it('задаёт Roadmap cap 60 минут для embedded timed-практик', () => {
    const meditation = readProjectFile(
      'app/components/programs/ProgramMeditationAction.vue'
    );
    const breathing = readProjectFile(
      'app/components/programs/ProgramBreathPracticeAction.vue'
    );
    const quickHelp = readProjectFile(
      'app/components/programs/ProgramQuickHelpAction.vue'
    );

    expect(meditation).toContain('timerMinutes: 60');
    expect(meditation).toContain('persistPreferredTimer: false');
    expect(breathing).toContain('ROADMAP_PRACTICE_SESSION_MINUTES = 60');
    expect(quickHelp).toContain('ROADMAP_PRACTICE_SESSION_MINUTES = 60');
    expect([meditation, breathing, quickHelp].join('\n')).not.toContain(
      'open-ended'
    );
  });
});
