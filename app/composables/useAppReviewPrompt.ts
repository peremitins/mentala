import { ref, readonly } from 'vue';
import {
  getPersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';
import { usePlatform } from '@/app/composables/usePlatform';
import { useAppAnalytics } from '@/app/composables/useAppAnalytics';
import { GOOGLE_PLAY_WEB_URL } from '@/shared/utils/mobileAppLinks';

// =============================================================================
// Ключи в persistentStorage
//   Web:    localStorage → ключи с префиксом "persistent_"
//   Mobile: Capacitor Preferences → ключи с префиксом "persistent_"
//
// Сброс для тестирования (вставить в DevTools → Console):
//   ['status','shown_at','practices','first_at']
//     .forEach(k => localStorage.removeItem(`persistent_review_prompt.${k}`))
// =============================================================================
const KEY_STATUS = 'review_prompt.status';     // 'pending' | 'rated' | 'dismissed'
const KEY_SHOWN_AT = 'review_prompt.shown_at'; // ISO-дата последнего показа модалки
const KEY_PRACTICES = 'review_prompt.practices'; // число завершённых практик/шагов
const KEY_FIRST_AT = 'review_prompt.first_at'; // ISO-дата первой завершённой практики

// Условия показа:
const MIN_PRACTICES = 3;           // пользователь завершил ≥3 практики или шага программы
const MIN_DAYS_SINCE_FIRST = 3;    // с момента первой практики прошло ≥3 дней
const DISMISS_COOLDOWN_DAYS = 15;  // после «Позже» — следующий показ не раньше чем через 15 дней

const _open = ref(false);

// Определяет, открыт ли сайт на Apple-устройстве в браузере (iPhone/iPad/Mac).
// App Store ещё не готов — таким пользователям не показываем.
function isAppleWebDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Macintosh охватывает и обычные Mac, и iPad в режиме «Запросить версию для ПК».
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

// Определяет, открыт ли сайт на Android в браузере.
function isAndroidWebDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function useAppReviewPrompt() {
  const { getPlatform } = usePlatform();
  const { reachGoal } = useAppAnalytics();

  // Вызывать после каждой завершённой практики или шага программы.
  // «Практика» = дыхательная практика (breath-practices/[slug].vue)
  //             + шаг программы (programs/[slug]/steps/[step].vue)
  async function recordPracticeCompleted(): Promise<void> {
    const raw = await getPersistentItem(KEY_PRACTICES);
    const count = raw ? parseInt(raw, 10) : 0;
    await setPersistentItem(KEY_PRACTICES, String(count + 1));

    const firstAt = await getPersistentItem(KEY_FIRST_AT);
    if (!firstAt) {
      await setPersistentItem(KEY_FIRST_AT, new Date().toISOString());
    }
  }

  async function isEligible(): Promise<boolean> {
    const platform = getPlatform();

    // iOS нативное: App Store ещё не опубликован → не показываем
    if (platform === 'ios') return false;

    if (platform === 'web') {
      // Apple-устройства в браузере тоже скрываем
      if (isAppleWebDevice()) return false;
      // На web показываем только Android-браузерам (откроем Play Store)
      if (!isAndroidWebDevice()) return false;
    }

    const status = await getPersistentItem(KEY_STATUS);
    // Пользователь уже поставил оценку — больше не беспокоим
    if (status === 'rated') return false;

    // Должно быть выполнено ≥3 практик/шагов программы
    const practices = parseInt(
      (await getPersistentItem(KEY_PRACTICES)) ?? '0',
      10
    );
    if (practices < MIN_PRACTICES) return false;

    // С момента первой практики должно пройти ≥5 дней
    const firstAt = await getPersistentItem(KEY_FIRST_AT);
    if (!firstAt) return false;
    const daysSinceFirst =
      (Date.now() - new Date(firstAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFirst < MIN_DAYS_SINCE_FIRST) return false;

    // Если ранее закрыл модалку («Позже») — ждём 30 дней перед следующим показом
    if (status === 'dismissed') {
      const shownAt = await getPersistentItem(KEY_SHOWN_AT);
      if (!shownAt) return true;
      const daysSinceShown =
        (Date.now() - new Date(shownAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceShown < DISMISS_COOLDOWN_DAYS) return false;
    }

    return true;
  }

  async function checkAndShow(): Promise<void> {
    if (!(await isEligible())) return;
    await setPersistentItem(KEY_SHOWN_AT, new Date().toISOString());
    reachGoal('review_prompt_shown');
    _open.value = true;
  }

  async function onConfirm(): Promise<void> {
    _open.value = false;
    reachGoal('review_prompt_accepted');
    await setPersistentItem(KEY_STATUS, 'rated');
    await triggerReview();
  }

  async function onDismiss(): Promise<void> {
    _open.value = false;
    reachGoal('review_prompt_dismissed');
    await setPersistentItem(KEY_STATUS, 'dismissed');
  }

  async function triggerReview(): Promise<void> {
    const platform = getPlatform();

    if (platform === 'android') {
      // Нативный Android: Google Play In-App Review API (нативный диалог магазина)
      try {
        const { InAppReview } = await import(
          '@capacitor-community/in-app-review'
        );
        await InAppReview.requestReview();
        reachGoal('review_native_triggered');
        return;
      } catch {
        // Если нативный диалог упал — fallback на открытие магазина
      }
    }

    // Fallback / web Android: открываем Play Store в браузере
    const { openExternalBrowser } = await import(
      '@/app/utils/openExternalBrowser'
    );
    await openExternalBrowser(GOOGLE_PLAY_WEB_URL);
  }

  return {
    open: readonly(_open),
    recordPracticeCompleted,
    checkAndShow,
    onConfirm,
    onDismiss,
  };
}
