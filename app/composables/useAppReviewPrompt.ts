import { ref, readonly } from 'vue';
import {
  getPersistentItem,
  setPersistentItem,
  removePersistentItem,
} from '@/app/utils/persistentStorage';
import { useIsDev } from '@/app/composables/useIsDev';
import { usePlatform } from '@/app/composables/usePlatform';
import { useAppAnalytics } from '@/app/composables/useAppAnalytics';
import {
  GOOGLE_PLAY_WEB_URL,
  GOOGLE_PLAY_MARKET_URL,
  buildGooglePlayIntentUrl,
} from '@/shared/utils/mobileAppLinks';

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

// Чтобы dev-API в window прокидывался один раз, а не на каждый вызов composable.
let _debugApiExposed = false;

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

    // С момента первой практики должно пройти ≥3 дней
    const firstAt = await getPersistentItem(KEY_FIRST_AT);
    if (!firstAt) return false;
    const daysSinceFirst =
      (Date.now() - new Date(firstAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFirst < MIN_DAYS_SINCE_FIRST) return false;

    // Если ранее закрыл модалку («Позже») — ждём 15 дней перед следующим показом
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

  // Открывает карточку приложения в Google Play по явному клику пользователя.
  //
  // Раньше здесь вызывался Google Play In-App Review API
  // (`InAppReview.requestReview()`). Это было ненадёжно и давало баг «кнопка
  // ничего не делает»: API отрисовывает диалог только по своему усмотрению
  // (квоты Google) и вообще ничего не показывает на debug/sideload-сборках и
  // на сборках, установленных не из Google Play. При этом промис резолвится
  // успешно — определить, показался диалог или нет, невозможно, поэтому
  // fallback на магазин не срабатывал. Google прямо не рекомендует вешать
  // In-App Review на кнопку «Оценить» — для явного действия нужен переход в
  // карточку магазина. Это же требует ТЗ (.docs/pwa_native_modals.md, п.4):
  // приоритет — открыть карточку в приложении Google Play, https — fallback.
  async function triggerReview(): Promise<void> {
    const platform = getPlatform();
    reachGoal('review_store_opened');

    if (platform === 'android') {
      await openGooglePlayNative();
      return;
    }

    // По условиям isEligible() сюда попадает только Android-браузер (web).
    openGooglePlayWeb();
  }

  // Native Android (Capacitor): отдаём ссылку системе через ACTION_VIEW.
  // market:// открывает карточку прямо в приложении Google Play; если оно
  // недоступно (нет Play Store / упал intent) — откатываемся на https-карточку.
  async function openGooglePlayNative(): Promise<void> {
    const { InAppBrowser } = await import('@capacitor/inappbrowser');

    try {
      await InAppBrowser.openInExternalBrowser({ url: GOOGLE_PLAY_MARKET_URL });
      return;
    } catch (error) {
      console.warn(
        '[useAppReviewPrompt] market:// не открылся, fallback на https:',
        error
      );
    }

    try {
      await InAppBrowser.openInExternalBrowser({ url: GOOGLE_PLAY_WEB_URL });
    } catch (error) {
      console.warn(
        '[useAppReviewPrompt] Не удалось открыть Google Play по https:',
        error
      );
    }
  }

  // Android-браузер (web): intent:// открывает приложение Google Play, а при
  // его отсутствии встроенный S.browser_fallback_url ведёт на https-карточку.
  function openGooglePlayWeb(): void {
    if (typeof window === 'undefined') return;

    const intentUrl = buildGooglePlayIntentUrl(GOOGLE_PLAY_WEB_URL);
    if (typeof window.location.assign === 'function') {
      window.location.assign(intentUrl);
      return;
    }

    window.location.href = intentUrl;
  }

  // ===========================================================================
  // Dev-хелперы для тестирования.
  //
  // ВАЖНО: состояние review-prompt хранится ЛОКАЛЬНО на устройстве
  // (Capacitor Preferences на Android/iOS, localStorage в web) — не в БД и не на
  // аккаунте. После нажатия «Оценить приложение» статус становится 'rated', и
  // модалка больше не показывается. Плюс есть пороги: ≥3 практик и ≥3 дней с
  // первой практики. Поэтому для повторного теста состояние нужно сбросить.
  // Все хелперы прокидываются в window.__reviewPrompt только при isDev.
  // ===========================================================================

  // Полный сброс — как будто пользователь новый.
  async function resetForTesting(): Promise<void> {
    await Promise.all([
      removePersistentItem(KEY_STATUS),
      removePersistentItem(KEY_SHOWN_AT),
      removePersistentItem(KEY_PRACTICES),
      removePersistentItem(KEY_FIRST_AT),
    ]);
  }

  // Подготовить состояние так, чтобы модалка прошла реальную isEligible() при
  // следующем checkAndShow() (или завершении практики): сбрасываем статус,
  // ставим практики = порогу и first_at в прошлое за пределами окна.
  async function primeForTesting(): Promise<void> {
    await Promise.all([
      removePersistentItem(KEY_STATUS),
      removePersistentItem(KEY_SHOWN_AT),
      setPersistentItem(KEY_PRACTICES, String(MIN_PRACTICES)),
      setPersistentItem(
        KEY_FIRST_AT,
        new Date(
          Date.now() - (MIN_DAYS_SINCE_FIRST + 1) * 24 * 60 * 60 * 1000
        ).toISOString()
      ),
    ]);
  }

  // Принудительно показать модалку, минуя все условия — для проверки UI и
  // редиректа в магазин без ожидания порогов.
  function forceShow(): void {
    _open.value = true;
  }

  // Текущее состояние хранилища (удобно смотреть из консоли).
  async function getDebugState(): Promise<Record<string, string | null>> {
    const [status, shownAt, practices, firstAt] = await Promise.all([
      getPersistentItem(KEY_STATUS),
      getPersistentItem(KEY_SHOWN_AT),
      getPersistentItem(KEY_PRACTICES),
      getPersistentItem(KEY_FIRST_AT),
    ]);
    return {
      platform: getPlatform(),
      status,
      shownAt,
      practices,
      firstAt,
    };
  }

  // Прокидываем dev-API в консоль (в т.ч. для chrome://inspect на Android).
  if (typeof window !== 'undefined' && !_debugApiExposed && useIsDev().value) {
    _debugApiExposed = true;
    (
      window as Window & { __reviewPrompt?: Record<string, unknown> }
    ).__reviewPrompt = {
      show: forceShow,
      reset: resetForTesting,
      prime: primeForTesting,
      check: checkAndShow,
      state: getDebugState,
    };
    console.info(
      '[review] dev-API: window.__reviewPrompt = { show(), reset(), prime(), check(), state() }'
    );
  }

  return {
    open: readonly(_open),
    recordPracticeCompleted,
    checkAndShow,
    onConfirm,
    onDismiss,
    resetForTesting,
    primeForTesting,
    forceShow,
  };
}
