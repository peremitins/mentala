import { describe, it, expect } from 'vitest';
import { notificationTemplates } from '../app/lib/notificationTemplates';

describe('notificationTemplates imageTag', () => {
  it('должен быть проставлен (или null) для всех шаблонов', () => {
    const withUndefined = notificationTemplates.filter(
      (template) => template.imageTag === undefined
    );
    expect(withUndefined).toHaveLength(0);
  });

  it('для шаблонов imageTag либо null, либо задан явно', () => {
    const invalid = notificationTemplates.filter(
      (template) => template.imageTag === undefined
    );
    expect(invalid).toHaveLength(0);
  });
});
