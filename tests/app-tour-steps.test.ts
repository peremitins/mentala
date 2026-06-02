import { describe, expect, it } from 'vitest';
import { APP_TOUR_STEPS } from '../app/lib/appTourSteps';

describe('APP_TOUR_STEPS', () => {
  it('начинает тур с актуального daily loop на главной', () => {
    expect(APP_TOUR_STEPS.slice(0, 3).map((step) => step.id)).toEqual([
      'home-roadmap',
      'home-garden',
      'home-hero',
    ]);
  });

  it('не содержит удалённые перегружающие шаги', () => {
    const stepIds = APP_TOUR_STEPS.map((step) => step.id);

    expect(stepIds).not.toContain('summary-example');
    expect(stepIds).not.toContain('therapy-quick-chat');
    expect(stepIds).not.toContain('therapy-quick-meditation');
    expect(stepIds).not.toContain('therapy-quick-breath');
    expect(stepIds).not.toContain('therapy-reminders-edit');
    expect(stepIds).not.toContain('custom-prompt');
  });

  it('ведёт из ассистента в чат и возвращается к терапии без экрана итогов', () => {
    const homeHero = APP_TOUR_STEPS.find((step) => step.id === 'home-hero');
    const chatSummary = APP_TOUR_STEPS.find(
      (step) => step.id === 'chat-summary'
    );

    expect(homeHero?.navigateTo).toBe('/chat');
    expect(homeHero?.awaitSelector).toBe('[data-tour="chat-mic"]');
    expect(chatSummary?.navigateTo).toBe('/therapy');
    expect(chatSummary?.awaitSelector).toBe('[data-tour="therapy-card"]');
  });
});
