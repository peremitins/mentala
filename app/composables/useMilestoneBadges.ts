import { ref } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import type {
  EarnedMilestoneDto,
  MilestoneEventType,
  MilestonesResponseDto,
} from '@/shared/dto/milestones';

interface PendingCelebrationItem extends EarnedMilestoneDto {
  // Временная метка (ms), раньше которой не показывать.
  // Используется для задержки при завершении сада (чтобы не конфликтовать
  // с анимациями цветка и рапорта). Для всех остальных = Date.now().
  showAfter: number;
}

// Модульный уровень — состояние общее для всех инстансов composable.
const pendingCelebration = ref<PendingCelebrationItem[]>([]);
const earnedMilestones = ref<EarnedMilestoneDto[]>([]);
const isLoaded = ref(false);

// Guard для автоматической проверки временных достижений (по активным дням).
// Module-level, чтобы переживать ремаунты layout. Сбрасывается при logout.
const activityChecked = ref(false);
let lastActivityCheckAt = 0;

export function useMilestoneBadges() {
  async function loadMilestones() {
    try {
      const data = await useAPI<MilestonesResponseDto>('/api/milestones');
      earnedMilestones.value = data.earned;
      isLoaded.value = true;
    } catch {
      // Не блокируем UI при ошибке
    }
  }

  /**
   * Проверяет и выдаёт достижения.
   * @param delayMs — задержка перед показом celebration (мс).
   *   Используй ~5500 для garden_completed, чтобы не конфликтовать
   *   с анимацией цветка и карточкой рапорта.
   */
  async function checkMilestones(
    event: MilestoneEventType,
    gardenSlug?: string,
    delayMs = 0
  ) {
    try {
      const data = await useAPI<{ newBadges: EarnedMilestoneDto[] }>(
        '/api/milestones/check',
        { method: 'POST', body: { event, gardenSlug } }
      );
      if (data.newBadges.length > 0) {
        const showAfter = Date.now() + delayMs;
        const newItems: PendingCelebrationItem[] = data.newBadges.map((b) => ({
          ...b,
          showAfter,
        }));
        pendingCelebration.value.push(...newItems);
        earnedMilestones.value.push(...data.newBadges);
      }
    } catch {
      // Не ломаем основной флоу
    }
  }

  /**
   * Проверяет временные достижения (по активным дням) через event `activity_check`.
   * Внутренний хелпер: всегда обновляет таймстамп последней проверки.
   */
  async function checkActivityMilestones(delayMs = 0) {
    lastActivityCheckAt = Date.now();
    await checkMilestones('activity_check', undefined, delayMs);
  }

  /**
   * Однократная (за сессию) автопроверка временных достижений при входе в приложение.
   * Закрывает кейс, когда «Первая неделя» / «30 дней» уже заработаны, но пользователь
   * не открывал страницу достижений — теперь анимация всплывёт автоматически.
   */
  async function checkActivityMilestonesOnce(delayMs = 0) {
    if (activityChecked.value) return;
    activityChecked.value = true;
    await checkActivityMilestones(delayMs);
  }

  /**
   * Повторная проверка при возврате приложения из фона, но не чаще minIntervalMs —
   * чтобы не дёргать API при частых переключениях.
   */
  async function checkActivityMilestonesThrottled(
    minIntervalMs: number,
    delayMs = 0
  ) {
    if (Date.now() - lastActivityCheckAt < minIntervalMs) return;
    await checkActivityMilestones(delayMs);
  }

  /** Сбрасывает guard автопроверки (при logout — чтобы новый аккаунт проверился). */
  function resetActivityCheck() {
    activityChecked.value = false;
    lastActivityCheckAt = 0;
  }

  /** Возвращает следующее готовое к показу достижение (по showAfter). */
  function popNextCelebration(): EarnedMilestoneDto | null {
    const now = Date.now();
    const idx = pendingCelebration.value.findIndex((p) => p.showAfter <= now);
    if (idx === -1) return null;
    const [item] = pendingCelebration.value.splice(idx, 1);
    return item ?? null;
  }

  /** Есть ли достижения, готовые к показу прямо сейчас. */
  function hasReadyCelebration(): boolean {
    const now = Date.now();
    return pendingCelebration.value.some((p) => p.showAfter <= now);
  }

  function isEarned(badgeId: string): boolean {
    return earnedMilestones.value.some((m) => m.badgeId === badgeId);
  }

  function getEarnedAt(badgeId: string): string | null {
    return (
      earnedMilestones.value.find((m) => m.badgeId === badgeId)?.earnedAt ??
      null
    );
  }

  return {
    earnedMilestones,
    pendingCelebration,
    isLoaded,
    loadMilestones,
    checkMilestones,
    checkActivityMilestonesOnce,
    checkActivityMilestonesThrottled,
    resetActivityCheck,
    popNextCelebration,
    hasReadyCelebration,
    isEarned,
    getEarnedAt,
  };
}
