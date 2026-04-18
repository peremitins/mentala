/**
 * usePwaInstall — управление предложением установки PWA
 *
 * Для Android/Desktop: перехватывает beforeinstallprompt и показывает кнопку.
 * Для iOS: показывает инструкцию "добавить на экран Домой" в Safari.
 *
 * Правила показа:
 * - Не показывать до авторизации
 * - Не показывать первые несколько секунд визита
 * - После отказа — не показывать 7 дней
 * - После установки — не показывать снова
 */

// Хранит timestamp следующего показа (следующие 10:00)
const DISMISSED_KEY = 'mentala.pwa.install_show_after';
const INSTALLED_KEY = 'mentala.pwa.installed';

/**
 * Возвращает timestamp ближайшего 10:00 (сегодня или завтра).
 * Если сейчас уже ≥ 10:00 — возвращает 10:00 завтра.
 */
function getNext10am(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(10, 0, 0, 0);
  if (now >= next) next.setDate(next.getDate() + 1);
  return next.getTime();
}

// ==========================================
// Перехват beforeinstallprompt на уровне модуля
//
// Chrome на Android стреляет beforeinstallprompt очень рано — в первые
// секунды загрузки страницы, до того как init() успевает зарегистрировать
// слушатель. Поэтому слушатель регистрируется немедленно при загрузке
// модуля, а ref внутри composable подхватывает уже сохранённое событие.
// ==========================================

let _capturedInstallPrompt: Event | null = null;
let _appInstalled = false;
const _installPromptCallbacks: Array<(e: Event) => void> = [];

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _capturedInstallPrompt = e;
    // Оповещаем все активные экземпляры composable
    _installPromptCallbacks.forEach((cb) => cb(e));
  });

  window.addEventListener('appinstalled', () => {
    _appInstalled = true;
    _capturedInstallPrompt = null;
  });
}

/**
 * Синхронная проверка: запущено ли приложение как нативное (Capacitor).
 * window.Capacitor устанавливается самим Capacitor'ом при native-запуске.
 * Надёжнее чем проверка URL (Android Capacitor использует http://localhost, не capacitor://).
 */
function isNativeCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export function usePwaInstall() {
  // Инициализируем ref уже захваченным событием (если оно успело прийти до init())
  const installPromptEvent = ref<Event | null>(_capturedInstallPrompt);
  const isInstalled = ref(false);
  const isIos = ref(false);
  const isInStandaloneMode = ref(false);
  const showInstallBanner = ref(false);
  const showIosGuide = ref(false);

  function detectIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return (
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function detectStandaloneMode(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  }

  function isDismissedRecently(): boolean {
    if (typeof window === 'undefined') return false;
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    // Храним не время закрытия, а время следующего показа (ближайшие 10:00)
    return Date.now() < Number(raw);
  }

  function isAlreadyInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    // Единственный надёжный признак установки — приложение запущено в standalone-режиме.
    // localStorage-флаг не используем: он не сбрасывается при удалении PWA.
    return _appInstalled || detectStandaloneMode();
  }

  /**
   * Закрыл баннер — скрываем до следующих 10:00.
   * Ровно в 10:00 баннер снова появится при открытии сайта.
   */
  function markDismissed() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DISMISSED_KEY, String(getNext10am()));
    showInstallBanner.value = false;
    showIosGuide.value = false;
  }

  // Алиас для обратной совместимости
  const markSessionDismissed = markDismissed;

  function markInstalled() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(INSTALLED_KEY, 'true');
    showInstallBanner.value = false;
    showIosGuide.value = false;
    installPromptEvent.value = null;
    _capturedInstallPrompt = null;
  }

  /**
   * Инициализация — вызывать один раз после авторизации.
   * Синхронизирует ref с уже перехваченным событием (если оно пришло до init).
   */
  function init() {
    if (typeof window === 'undefined') return;

    // Нативное Capacitor-приложение — не предлагаем установку PWA
    if (isNativeCapacitorApp()) return;

    isIos.value = detectIos();
    isInStandaloneMode.value = detectStandaloneMode();
    isInstalled.value = isAlreadyInstalled();

    // Если уже установлено — ничего не показываем
    if (isInstalled.value || isInStandaloneMode.value) return;

    // Если недавно отказался — ничего не показываем
    if (isDismissedRecently()) return;

    if (!isIos.value) {
      // Подхватываем событие, которое могло прийти ДО вызова init()
      installPromptEvent.value = _capturedInstallPrompt;

      // Подписываемся на будущие события (например, после смены окружения или повторного визита)
      const onPrompt = (e: Event) => {
        installPromptEvent.value = e;
      };
      _installPromptCallbacks.push(onPrompt);

      // Очищаем подписку при размонтировании компонента
      onUnmounted(() => {
        const idx = _installPromptCallbacks.indexOf(onPrompt);
        if (idx !== -1) _installPromptCallbacks.splice(idx, 1);
      });
    }
  }

  /**
   * Показывает нативный промпт установки (Android/Desktop).
   * Вызывать по явному действию пользователя.
   */
  async function promptInstall(): Promise<boolean> {
    if (!installPromptEvent.value) return false;
    const prompt = installPromptEvent.value as any;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      markInstalled();
      return true;
    } else {
      markDismissed();
      return false;
    }
  }

  function isSafariOnIos(): boolean {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  }

  /**
   * Определяет, открыт ли сайт в любом браузере на Android (не нативное Capacitor-приложение).
   * Chrome, Samsung Internet, Firefox, Edge, Brave, Opera — все поддерживают установку PWA
   * через меню браузера. beforeinstallprompt поддерживают все кроме Firefox.
   *
   * ВАЖНО: Android Capacitor использует http://localhost (не capacitor://), поэтому
   * проверка URL ненадёжна. Используем window.Capacitor.isNativePlatform() вместо URL.
   */
  function isAndroidBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    // Нативное Capacitor-приложение — не показываем предложение установки PWA
    if (isNativeCapacitorApp()) return false;
    const ua = navigator.userAgent;
    return /Android/.test(ua);
  }

  /**
   * Можно ли показать предложение установки.
   * Для Android: показываем всегда (нативный промпт или мануальный гайд).
   * Для iOS: только в Safari.
   */
  function canShowInstallOffer(): boolean {
    // Нативное Capacitor-приложение — никогда не показываем предложение установки PWA
    if (isNativeCapacitorApp()) return false;

    if (isInstalled.value || isInStandaloneMode.value) return false;
    if (isDismissedRecently()) return false;

    if (isIos.value) {
      // iOS: показываем инструкцию только в Safari
      // (в Chrome/Firefox на iOS web push всё равно не работает)
      return isSafariOnIos();
    }

    // Любой Android-браузер: нативный промпт или мануальный гайд
    if (isAndroidBrowser()) return true;

    // Desktop: только если есть нативный beforeinstallprompt
    return !!installPromptEvent.value;
  }

  /**
   * Доступен ли нативный промпт установки (beforeinstallprompt).
   * Если false на Android — показываем мануальный гайд вместо кнопки «Установить».
   */
  const hasNativeInstallPrompt = computed(() => !!installPromptEvent.value);

  return {
    installPromptEvent: readonly(installPromptEvent),
    isInstalled: readonly(isInstalled),
    isIos: readonly(isIos),
    isInStandaloneMode: readonly(isInStandaloneMode),
    hasNativeInstallPrompt: readonly(hasNativeInstallPrompt),
    showInstallBanner,
    showIosGuide,
    init,
    promptInstall,
    canShowInstallOffer,
    markDismissed,
    markSessionDismissed,
    isSafariOnIos,
    isAndroidBrowser,
  };
}
