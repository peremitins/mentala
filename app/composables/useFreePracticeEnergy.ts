import { useAPI } from '@/app/composables/useAPI';
import { notifyPlantWater } from '@/app/composables/usePlantWaterFeedback';
import type {
  AwardFreePracticeEnergyRequestDto,
  AwardFreePracticeEnergyResponseDto,
  FreePracticeSource,
} from '@/shared/dto/retention';

/**
 * Начисление 1 капли за свободную практику (retention/retention_long_term_strategy.md).
 *
 * Backend (`POST /api/energy/free-practice`):
 *  - идемпотентен по `(userId, source, sourceId)` — повторное начисление за то же
 *    действие безопасно;
 *  - применяет rate-limit «3 капли/день из свободных источников»;
 *  - возвращает `rewardGranted=false` если sourceId уже начислялся **или** лимит исчерпан.
 *
 * Frontend (этот composable):
 *  - вызывает endpoint без блокировки основного flow (`silent`-режим);
 *  - при `rewardGranted=true` запускает water-feedback в хедере;
 *  - при `rewardGranted=false` НЕ показывает уведомление (это не ошибка — либо
 *    дубль, либо честно достигнутый лимит дня);
 *  - сеть-ошибки логируются в console, но не падают тостом — практика
 *    пользователя не должна выглядеть «сломанной» из-за фейла энергии.
 *
 * Обновление energy.today / energy.weekly на главной происходит при следующем
 * `/api/today` (loadToday в pages/index.vue). Если в будущем понадобится
 * мгновенное обновление UI на странице практики — composable вернёт actual
 * `energyToday`/`energyWeekly`, потребитель может их закинуть в свой store.
 */

export type FreePracticeAwardOptions = {
  /** Подавить визуальный feedback при rewardGranted=true (тихое начисление). */
  silent?: boolean;
};

export function useFreePracticeEnergy() {
  async function award(
    source: FreePracticeSource,
    sourceId: string,
    options?: FreePracticeAwardOptions
  ): Promise<AwardFreePracticeEnergyResponseDto | null> {
    if (!sourceId || sourceId.trim().length === 0) {
      // Без sourceId backend отдаёт E_VALIDATION. Защищаемся на клиенте,
      // потому что часть API completion'ов имеют опциональные id'ы.
      console.warn('[useFreePracticeEnergy] empty sourceId, skipping award', {
        source,
      });
      return null;
    }

    const body: AwardFreePracticeEnergyRequestDto = {
      source,
      sourceId: sourceId.slice(0, 120),
    };

    try {
      const response = await useAPI<AwardFreePracticeEnergyResponseDto>(
        '/api/energy/free-practice',
        {
          method: 'POST',
          body,
          // Любая ошибка тут — фон, не показываем общим toast'ом,
          // обрабатываем ниже сами при необходимости.
          suppressErrorToast: true,
        }
      );

      if (response.rewardGranted && !options?.silent) {
        notifyPlantWater({
          intensity: 'small',
          source: 'free_practice',
          energyToday: response.energyToday,
          energyWeekly: response.energyWeekly,
        });
      }

      return response;
    } catch (error) {
      // 404 — endpoint ещё не задеплоен (старый сервер). 500/network — фон.
      // В обоих случаях UX практики не должен страдать.
      console.error(
        '[useFreePracticeEnergy] failed to award:',
        source,
        sourceId,
        error
      );
      return null;
    }
  }

  return { award };
}
