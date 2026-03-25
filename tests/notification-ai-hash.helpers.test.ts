import { describe, expect, it } from 'vitest';

import { buildAiTextConfigHashCandidates } from '../server/application/notifications/notification-ai-hash.helpers';

describe('notification AI hash helpers', () => {
  it('для шаблонной therapy темы возвращает новый и legacy hash', () => {
    const hashes = buildAiTextConfigHashCandidates({
      kind: 'therapy',
      isCustomEntity: false,
      entityKey: 'phobias',
      entityName: 'Страхи',
      entityDescription:
        'Помогаем мягко встретиться со страхами и вернуть ощущение контроля: маленькие шаги и поддержка.',
      tone: 'balanced',
      addressing: 'informal',
      directness: 'moderate',
      subtype: 'motivational',
      userGender: null,
      customPromptNotification: null,
    });

    expect(hashes).toHaveLength(2);
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('для кастомной therapy темы не добавляет legacy fallback', () => {
    const hashes = buildAiTextConfigHashCandidates({
      kind: 'therapy',
      isCustomEntity: true,
      entityKey: 'custom-topic-id',
      entityName: 'Мой страх',
      entityDescription: 'Кастомное описание',
      tone: 'balanced',
      addressing: 'informal',
      directness: 'moderate',
      subtype: 'motivational',
      userGender: null,
      customPromptNotification: null,
    });

    expect(hashes).toHaveLength(1);
  });
});
