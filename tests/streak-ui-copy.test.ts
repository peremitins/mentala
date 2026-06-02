import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const streakPage = readFileSync('app/pages/streak.vue', 'utf8');
const homeCard = readFileSync('app/components/home/HomeStreakCard.vue', 'utf8');
const streakService = readFileSync(
  'server/application/streak/streak.service.ts',
  'utf8'
);

describe('streak UI copy', () => {
  it('не показывает квоту repair как отдельную статистику', () => {
    expect(streakPage).not.toContain('Восстановления');
    expect(streakPage).not.toContain(
      'Период {{ history.summary.repair.period }}'
    );
    expect(homeCard).not.toContain('восстановлений:');
  });

  it('использует короткое слово "сохранено" для repaired-состояний', () => {
    expect(streakPage).not.toContain('Восстановлено');
    expect(streakPage).not.toContain('восстановлено');
    expect(streakPage).not.toContain('День восстановлен');
    expect(streakService).not.toContain('мягко восстановили');
    expect(streakPage).toContain('Сохранено');
    expect(streakService).toContain('сохранили пропущенный день');
  });
});
