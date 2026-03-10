import { findTopicByKey } from '../../../app/lib/therapyCatalog';
import type { NotificationSubtype } from '../../../shared/dto/notifications';

type TemplateTherapyTopicResolution = {
  entityName: string;
  entityDescription: string | null;
  foundInCatalog: boolean;
};

const ACTIONABLE_THERAPY_TOPIC_KEYS = new Set(['anxiety', 'phobias']);

function isActionableTherapyTopic(entityKey: string): boolean {
  return ACTIONABLE_THERAPY_TOPIC_KEYS.has(entityKey.trim().toLowerCase());
}

export function resolveTemplateTherapyTopic(
  entityKey: string
): TemplateTherapyTopicResolution {
  const normalizedKey = entityKey.trim().toLowerCase();
  const catalogTopic = findTopicByKey(normalizedKey);

  if (!catalogTopic) {
    return {
      entityName: entityKey,
      entityDescription: null,
      foundInCatalog: false,
    };
  }

  return {
    entityName: catalogTopic.name,
    entityDescription: catalogTopic.description || null,
    foundInCatalog: true,
  };
}

export function buildTherapyNotificationSubtypeInstructions(params: {
  entityKey: string;
  description?: string | null;
  subtype?: NotificationSubtype | null;
}): string {
  const therapyContext = params.description
    ? '- Все тексты должны быть релевантны теме из описания выше. Используй описание как основу.'
    : '- Все тексты должны быть релевантны этой теме поддержки.';
  const actionableNote = isActionableTherapyTopic(params.entityKey)
    ? '\n- Для тем страха и тревоги допустимы только мягкие практики самопомощи: дыхание, заземление, пауза, маленький безопасный шаг.\n- Не предлагай резкую экспозицию, давление или обещание быстрого результата.'
    : '';

  switch (params.subtype) {
    case 'reminder':
      return `${therapyContext}
- Давай один мягкий практический шаг или короткую технику, которую можно сделать сейчас.${actionableNote}`;
    case 'informational':
      return `${therapyContext}
- Давай короткий понятный факт или объяснение; если уместно, добавляй одну применимую подсказку.${actionableNote}`;
    case 'motivational':
      return `${therapyContext}
- Поддержка и мотивация в контексте этой темы.${actionableNote}`;
    case 'mixed':
      return `${therapyContext}
- Чередуй мягкие практические шаги, короткие факты и поддержку.${actionableNote}`;
    default:
      return `${therapyContext}${actionableNote}`;
  }
}
