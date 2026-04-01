import { describe, expect, it } from 'vitest';
import { ChatSettingsPatchDto } from '../shared/dto/chat-settings';
import {
  DEFAULT_ASSISTANT_VOICE_ID,
  getAssistantVoicesByGender,
  resolveAssistantVoicePresentation,
} from '../shared/constants/assistantVoiceCatalog';

describe('chat settings dto', () => {
  it('разрешает сохранить каталоговый voice из общего selector', () => {
    expect(
      ChatSettingsPatchDto.parse({
        assistantVoice: 'sage',
      })
    ).toEqual({
      assistantVoice: 'sage',
    });
  });

  it('запрещает сохранить voice вне curated пересечения realtime и tts', () => {
    expect(() =>
      ChatSettingsPatchDto.parse({
        assistantVoice: 'marin',
      })
    ).toThrow(/Unsupported assistant voice/i);
  });

  it('использует shimmer (Вера) как глобальный дефолтный голос', () => {
    expect(DEFAULT_ASSISTANT_VOICE_ID).toBe('shimmer');
  });

  it('ставит shimmer первым в женском сегменте и локализует его как Вера', () => {
    const femaleVoices = getAssistantVoicesByGender('female', 'ru');

    expect(femaleVoices[0]?.id).toBe('shimmer');
    expect(femaleVoices[0]?.label).toBe('Вера');
  });

  it('ставит echo первым в мужском сегменте и локализует его отдельным именем', () => {
    const maleVoices = getAssistantVoicesByGender('male', 'en');

    expect(maleVoices[0]?.id).toBe('echo');
    expect(maleVoices[0]?.label).toBe('Alex');
  });

  it('возвращает русские имена Вера, Надежда и Любовь для женских голосов', () => {
    expect(resolveAssistantVoicePresentation('shimmer', 'ru').label).toBe(
      'Вера'
    );
    expect(resolveAssistantVoicePresentation('sage', 'ru').label).toBe(
      'Надежда'
    );
    expect(resolveAssistantVoicePresentation('coral', 'ru').label).toBe(
      'Любовь'
    );
  });
});
