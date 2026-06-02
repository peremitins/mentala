import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveAppNavigationTargetFromRoute,
  resolveNavigationFeatureKey,
} from '../app/lib/navigation';

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('practice paywall preview surfaces', () => {
  it('не блокирует карточки медитаций и дневника на хабе практик', () => {
    const source = readProjectFile('app/pages/practices/index.vue');

    expect(source).not.toContain('v-if="meditationsAccess.available"');
    expect(source).not.toContain('v-if="gratitudeDiaryAccess.available"');
    expect(source).not.toContain('getLockedFeatureLabel(');
    expect(source).toContain('to="/meditations"');
    expect(source).toContain('to="/practices/gratitude-diary"');
    expect(source).not.toMatch(
      /to="\/meditations"[\s\S]{0,240}@click="openPaywall/
    );
    expect(source).not.toMatch(
      /to="\/practices\/gratitude-diary"[\s\S]{0,240}@click="openPaywall/
    );
  });

  it('не отдаёт route-level paywall для входа в медитации и дневник', () => {
    const meditationsList = resolveAppNavigationTargetFromRoute({
      path: '/meditations',
      params: {},
      query: {},
    });
    const meditationTrack = resolveAppNavigationTargetFromRoute({
      path: '/meditations',
      params: {},
      query: { trackId: 'ocean-slow' },
    });
    const gratitudeDiary = resolveAppNavigationTargetFromRoute({
      path: '/practices/gratitude-diary',
      params: {},
      query: {},
    });

    expect(meditationsList).toEqual({ type: 'meditations_list' });
    expect(meditationTrack).toEqual({
      type: 'meditation_track',
      trackId: 'ocean-slow',
    });
    expect(gratitudeDiary).toEqual({ type: 'gratitude_diary' });

    expect(
      resolveNavigationFeatureKey({ type: 'meditations_list' })
    ).toBeNull();
    expect(
      resolveNavigationFeatureKey({
        type: 'meditation_collection',
        topicKey: 'sleep',
      })
    ).toBeNull();
    expect(
      resolveNavigationFeatureKey({
        type: 'meditation_track',
        trackId: 'ocean-slow',
      })
    ).toBeNull();
    expect(resolveNavigationFeatureKey({ type: 'gratitude_diary' })).toBeNull();
  });

  it('route middleware очищает только stale paywall от route guard на preview-входах', () => {
    const source = readProjectFile('app/middleware/feature-access.global.ts');

    expect(source).toContain(
      "navigationStore.request?.source === 'route_guard'"
    );
    expect(source).toContain('navigationStore.clearPaywall()');
    expect(source).toContain('if (!featureKey)');
  });

  it('показывает детальную страницу медитации без read-gate, но блокирует действия', () => {
    const source = readProjectFile('app/pages/meditations/index.vue');
    const detailGate = source.match(
      /<MeditationDetailView[\s\S]*?v-if="selectedTrackId && meditationsAccess\.available"/
    );
    const listBranchEndIndex = source.indexOf('</template>');
    const paywallIndex = source.indexOf('<FeaturePaywallModal');

    expect(detailGate).toBeNull();
    expect(source).toContain(':locked="!meditationsAccess.available"');
    expect(source).toContain('@locked-action="openPaywall');
    expect(paywallIndex).toBeGreaterThan(listBranchEndIndex);
  });

  it('разводит paywall badge и heart на карточке медитации', () => {
    const source = readProjectFile(
      'app/components/meditations/MeditationCard.vue'
    );

    expect(source).toContain('absolute right-2 top-2 z-20');
    expect(source).toContain('absolute bottom-2 right-2 z-20');
  });

  it('не закрывает read-only API медитации и дневника благодарности', () => {
    const meditationDetail = readProjectFile(
      'server/api/meditations/[id].get.ts'
    );
    const diaryIndex = readProjectFile(
      'server/api/gratitude-diary/index.get.ts'
    );
    const diaryPrompts = readProjectFile(
      'server/api/gratitude-diary/prompts.get.ts'
    );
    const diaryEntry = readProjectFile(
      'server/api/gratitude-diary/entries/[id].get.ts'
    );

    expect(meditationDetail).not.toContain('getFeatureAccessOrDefault');
    expect(diaryIndex).not.toContain('assertGratitudeDiaryAccess');
    expect(diaryPrompts).not.toContain('assertGratitudeDiaryAccess');
    expect(diaryEntry).not.toContain('assertGratitudeDiaryAccess');
  });

  it('оставляет сохранение дневника заблокированным через entitlement', () => {
    const source = readProjectFile(
      'app/pages/practices/gratitude-diary/editor.vue'
    );

    expect(source).toContain("getFeatureAccess('gratitude.diary.full')");
    expect(source).toContain('!gratitudeDiaryAccess.available');
    expect(source).toContain(
      "paywallFeatureKey.value = 'gratitude.diary.full'"
    );
  });

  it('центрирует анимационные слои бейджа достижения относительно самого бейджа', () => {
    const source = readProjectFile(
      'app/components/milestones/MilestoneAchievementOverlay.vue'
    );

    expect(source).toContain('place-items: center');
    expect(source).toContain('transform: translate(-50%, -50%) scale(1.12)');
    expect(source).toContain('transform: translate(-50%, -50%) scale(2.4)');
  });
});
