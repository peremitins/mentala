import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function extractRequiredBlock(
  source: string,
  startMarker: string,
  endMarker: string
) {
  const start = source.indexOf(startMarker);
  expect(start, `Не найден блок ${startMarker}`).toBeGreaterThanOrEqual(0);

  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end, `Не найден конец блока ${startMarker}`).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('haptics UI source guards', () => {
  it('подключает light-отклик к круглым шагам roadmap без paywall/limit срабатывания', () => {
    const source = readProjectFile('app/components/home/HomeRoadmapCard.vue');

    expect(source).toContain(
      'const { triggerLight, triggerMedium } = useHaptics();'
    );

    const block = extractRequiredBlock(
      source,
      'function handleStepClick(step: ProgramStepDto) {',
      '</script>'
    );

    const paywallGuardIndex = block.indexOf('if (!hasRoadmapAccess.value)');
    const limitGuardIndex = block.indexOf(
      "if (step.status === 'active' && isDailyLimitReachedNow())"
    );
    const hapticIndex = block.indexOf('void triggerLight();');

    expect(hapticIndex).toBeGreaterThan(paywallGuardIndex);
    expect(hapticIndex).toBeGreaterThan(limitGuardIndex);
    expect(block).toContain("if (step.status === 'active')");
  });

  it('подключает light-отклик к mic и send в ChatRoom только после guard-условий', () => {
    const source = readProjectFile('app/components/chat/ChatRoom.vue');

    expect(source).toContain('@click="handleMicClick"');
    expect(source).toContain(
      'const { triggerLight, triggerSuccess } = useHaptics();'
    );

    const micBlock = extractRequiredBlock(
      source,
      'function handleMicClick() {',
      'const realtimeVoice = useRealtimeVoiceSession'
    );
    expect(
      micBlock.indexOf('if (isDictationMicDisabled.value) return;')
    ).toBeLessThan(micBlock.indexOf('void triggerLight();'));
    expect(micBlock).toContain('void toggleMic();');

    const sendBlock = extractRequiredBlock(
      source,
      'const onSend = async () => {',
      'function onSendPointer()'
    );
    for (const guard of [
      'if (!ensureChatAccessOrPaywall()) return;',
      'if (isTextInputDisabled.value) return;',
      'if (isSending.value) return;',
      'if (isUserTextOverLimit.value) return;',
      'if (!chat.userText?.trim()) return;',
    ]) {
      expect(sendBlock.indexOf(guard)).toBeLessThan(
        sendBlock.indexOf('void triggerLight();')
      );
    }
  });
});
