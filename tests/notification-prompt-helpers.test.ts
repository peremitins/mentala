import { describe, expect, it } from 'vitest';

import {
  buildTherapyNotificationSubtypeInstructions,
  resolveTemplateTherapyTopic,
} from '../server/application/notifications/notification-prompt-helpers';

describe('notification prompt helpers', () => {
  it('подтягивает системную therapy тему из каталога', () => {
    const result = resolveTemplateTherapyTopic('phobias');

    expect(result.foundInCatalog).toBe(true);
    expect(result.entityName).toBe('Страхи');
    expect(result.entityDescription).toContain('маленькие шаги');
  });

  it('добавляет компактные практические инструкции для страхов в reminder', () => {
    const instructions = buildTherapyNotificationSubtypeInstructions({
      entityKey: 'phobias',
      subtype: 'reminder',
    });

    expect(instructions).toContain('мягкий практический шаг');
    expect(instructions).toContain('дыхание');
    expect(instructions).toContain('Не предлагай резкую экспозицию');
  });

  it('для informational оставляет короткий формат с применимой подсказкой', () => {
    const instructions = buildTherapyNotificationSubtypeInstructions({
      entityKey: 'anxiety',
      subtype: 'informational',
      description:
        'Короткие уведомления про тревогу и способы быстро стабилизироваться.',
    });

    expect(instructions).toContain('короткий понятный факт или объяснение');
    expect(instructions).toContain('одну применимую подсказку');
    expect(instructions).toContain('Используй описание как основу');
  });
});
