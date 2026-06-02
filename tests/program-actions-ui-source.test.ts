import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PROGRAM_BREATH_LEGACY_ALIASES,
  resolveProgramBreathPractice,
} from '../app/lib/programBreathPracticeResolver';

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('program action UI source guards', () => {
  it('не содержит proactive support-блоков в micro-reflection и weekly-check', () => {
    const sources = [
      readProjectFile(
        'app/components/programs/ProgramMicroReflectionAction.vue'
      ),
      readProjectFile('app/components/programs/ProgramWeeklyCheckAction.vue'),
    ].join('\n');

    expect(sources).not.toContain('Можно взять поддержку прямо сейчас');
    expect(sources).not.toContain('showSupportBlock');
  });

  it('использует общий доступный slider в rating, weekly-check и structured-form', () => {
    const rangeScale = readProjectFile(
      'app/components/programs/ProgramRangeScale.vue'
    );
    const rating = readProjectFile(
      'app/components/programs/ProgramRatingScaleAction.vue'
    );
    const weekly = readProjectFile(
      'app/components/programs/ProgramWeeklyCheckAction.vue'
    );
    const structured = readProjectFile(
      'app/components/programs/ProgramStructuredFormAction.vue'
    );

    expect(rangeScale).toContain('type="range"');
    expect(rangeScale).toContain(':aria-valuetext="valueText"');
    expect(rangeScale).toContain('min-height: 44px');
    expect(rangeScale).toContain('--program-range-progress');
    expect(rangeScale).toContain('calc(17px + (100% - 32px)');
    expect(rating).toContain('ProgramRangeScale');
    expect(weekly).toContain('ProgramRangeScale');
    expect(structured).toContain('ProgramRangeScale');
  });

  it('резолвит legacy breathing aliases для старых started-attempt', () => {
    const aliases = [
      'equal-breathing',
      'slow-exhale',
      'long-exhale',
      'steady-breath',
      'calm-start',
      'anxiety',
      'stress',
      'breathing_4_6',
      'box_breathing',
    ];

    for (const alias of aliases) {
      expect(PROGRAM_BREATH_LEGACY_ALIASES[alias], alias).toBeTruthy();
      expect(resolveProgramBreathPractice(alias), alias).toBeTruthy();
    }
  });

  it('называет CTA финального weekly-check формированием итогового отчёта', () => {
    const stepRunner = readProjectFile(
      'app/pages/programs/[slug]/steps/[step].vue'
    );

    expect(stepRunner).toContain('isFinalReportTriggerAction');
    expect(stepRunner).toContain('Сформировать итоговый отчёт');
  });

  it('использует чеклист и один общий composer для скрипта просьбы', () => {
    const guidedSteps = readProjectFile(
      'app/components/programs/ProgramGuidedStepsAction.vue'
    );
    const retentionProgramService = readProjectFile(
      'server/application/programs/retention-program.service.ts'
    );

    expect(guidedSteps).toContain('GratitudeDiaryEmbeddedComposer');
    expect(guidedSteps).toContain('Итоговая просьба');
    expect(guidedSteps).toContain('SCRIPT_FINAL_TEXT_ID');
    expect(guidedSteps).toContain("formKind === 'support_request_script'");
    expect(guidedSteps).not.toContain('<textarea');

    const stepRunner = readProjectFile(
      'app/pages/programs/[slug]/steps/[step].vue'
    );
    expect(stepRunner).toContain('scriptText');
    expect(stepRunner).toContain('Заполни просьбу');
    expect(retentionProgramService).not.toContain(
      "idSuffix: 'support-request',"
    );
    expect(retentionProgramService).not.toContain("title: 'Моя просьба'");
  });
});
