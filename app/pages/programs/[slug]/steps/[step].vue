<template>
  <div
    class="flex flex-col relative h-full overflow-y-auto rounded-lg xs:space-y-3 space-y-1"
    :class="rootPaddingClass"
  >
    <PageHeader
      :title="response?.program.title || 'Шаг программы'"
      show-back-button
      @go-back="goBack"
    >
      <template #actions>
        <AssistantVolumeControl />
      </template>
    </PageHeader>

    <template v-if="isCompleted && response">
      <!-- Обычный success-экран: шаг пройден, программа продолжается.
           Используем Teleport + fixed overlay, чтобы карточка была строго
           по центру и не перекрывалась PageHeader/BottomNav на маленьких
           экранах. На больших — overlay-карточка выглядит как обычно по
           центру вьюпорта. -->
      <!-- Success-экран показываем и для обычных/чекпоинт-шагов, и для финала.
           На финале сначала проигрывается анимация цветка (flyout), и только
           после неё открывается оверлей формирования отчёта (см. orchestration
           в onPlantFlyoutComplete / maybeReveal*). Поэтому success-экран
           больше не скрывается на isProgramJustCompleted. -->
      <Teleport to="body">
        <div
          class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          :aria-label="isProgramJustCompleted ? 'Сад завершён' : 'Шаг пройден'"
        >
          <div class="glass-deep w-full max-w-sm px-5 py-7 text-center">
            <div
              class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200/25 bg-emerald-300/15 text-emerald-100"
              aria-hidden="true"
            >
              <IconPartyPopper class="h-8 w-8" />
            </div>
            <h1 class="text-2xl font-semibold text-foreground">
              {{
                isProgramJustCompleted
                  ? 'Сад завершён!'
                  : `Шаг ${response.step.step} пройден!`
              }}
            </h1>
            <p class="mt-2 text-sm leading-relaxed text-foreground/70">
              {{ completionText }}
            </p>
            <ProgramStepPlantReward
              v-if="completedProgram"
              :program="completedProgram"
              :reward-amount="response.step.energyReward"
              :reward-granted="completionRewardGranted"
              :is-final-step="isProgramJustCompleted"
              @flyout-complete="onPlantFlyoutComplete"
            />
            <!-- Кнопки навигации скрыты на финале: после анимации откроется
                 отчёт, а из него — переход в Оранжерею. -->
            <div
              v-if="!isProgramJustCompleted"
              class="mt-6 flex flex-col items-center gap-3"
            >
              <button
                v-if="hasNextStep"
                type="button"
                class="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-foreground px-8 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.99]"
                @click="goToNextStep"
              >
                Следующий шаг
              </button>
              <button
                type="button"
                class="text-sm font-medium text-foreground/65 underline-offset-4 hover:underline"
                @click="goToHomeFromSuccess"
              >
                На главную
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <template v-else-if="response && currentAction">
      <ProgramStepHeader
        class=""
        :step="response.step.step"
        :total-steps="response.program.totalSteps"
        :program-title="response.program.title"
        :title="response.step.title"
        :actions="response.attempt.actions"
        :current-index="actionIndex"
        :action-number="actionIndex + 1"
        :transiently-completed-ids="completedActionIds"
      />

      <section
        v-if="showActionIntro"
        class="glass-deep p-3 xs:space-y-3 space-y-1"
      >
        <p v-if="currentAction.subtitle" class="text-xs text-foreground/55">
          {{ currentAction.subtitle }}
        </p>
        <div class="flex items-start justify-between gap-2">
          <h2 class="text-2xl font-semibold leading-tight text-foreground">
            {{ currentAction.title }}
          </h2>
          <!-- «?»-подсказка к практике рядом с заголовком. Для типов с
               заголовком в этой секции (например guided_steps) у action нет
               prompt, поэтому встроенный в сам action-компонент тултип не
               рендерится — показываем его здесь, у названия практики. -->
          <ProgramHelpHint
            v-if="currentAction.helpHint"
            :title="currentAction.helpHint.title || null"
            :description="currentAction.helpHint.description || null"
            :examples="currentAction.helpHint.examples || null"
            aria-label="Подсказка к практике"
          />
        </div>
      </section>

      <section :class="actionSectionClass">
        <div
          v-if="currentAction.type === 'mood_checkin'"
          class="grid grid-cols-5 gap-2 justify-items-center"
        >
          <button
            v-for="item in moods"
            :key="item.value"
            type="button"
            class="flex h-[50px] w-[50px] items-center justify-center rounded-full border text-[28px] transition duration-200 active:scale-95 disabled:opacity-60"
            :class="
              selectedMood === item.value
                ? item.class
                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
            "
            @click="selectedMood = item.value"
          >
            <span
              class="flex items-center justify-center pt-[4px] transition-transform duration-200"
              :class="{ 'scale-110': selectedMood === item.value }"
              >{{ item.emoji }}</span
            >
          </button>
        </div>

        <div
          v-else-if="currentAction.type === 'breathing'"
          class="overflow-hidden"
        >
          <ProgramBreathPracticeAction
            :action="currentAction"
            @complete="markCurrentPracticeComplete"
            @start="startCurrentActionUnlock"
            @pause="pauseCurrentActionUnlock"
            @stop="stopCurrentActionUnlock"
          />
        </div>

        <ProgramQuickHelpAction
          v-else-if="isQuickHelpAction(currentAction)"
          :action="currentAction"
          @complete="markCurrentPracticeComplete"
          @start="startCurrentActionUnlock"
          @pause="pauseCurrentActionUnlock"
          @stop="stopCurrentActionUnlock"
        />

        <ProgramMeditationAction
          v-else-if="currentAction.type === 'meditation'"
          :action="currentAction"
          @complete="markCurrentPracticeComplete"
          @start="startCurrentActionUnlock"
          @pause="pauseCurrentActionUnlock"
          @stop="stopCurrentActionUnlock"
        />

        <ProgramReflectionAction
          v-else-if="currentAction.type === 'ai_reflection'"
          v-model="textDraft"
          v-model:selected-chips="reflectionChips"
          :prompt="currentAction.prompt"
          :chip-options="currentAction.chipOptions"
          :help-hint="currentAction.helpHint"
          @input-method-change="textInputMethod = $event"
        />

        <ProgramJournalEntryAction
          v-else-if="currentAction.type === 'journal_entry'"
          v-model="textDraft"
          :prompt="currentAction.prompt"
          :max-length="currentAction.maxLength"
          :prepared-answers="currentAction.preparedAnswers"
          :required="currentAction.required !== false"
          :help-hint="currentAction.helpHint"
          :placeholder-text="currentAction.placeholderText"
          @input-method-change="textInputMethod = $event"
        />

        <ProgramMicroReflectionAction
          v-else-if="currentAction.type === 'micro_reflection'"
          v-model="textDraft"
          v-model:selected-chips="reflectionChips"
          :prompt="currentAction.prompt"
          :chip-question="currentAction.chipQuestion"
          :chip-options="currentAction.chipOptions"
          :chip-mode="currentAction.chipMode"
          :help-hint="currentAction.helpHint"
          @input-method-change="textInputMethod = $event"
        />

        <ProgramRatingScaleAction
          v-else-if="currentAction.type === 'rating_scale'"
          v-model="ratingScaleValue"
          :action="currentAction"
        />

        <ProgramNextRouteChoiceAction
          v-else-if="currentAction.type === 'next_route_choice'"
          v-model="selectedRouteChoice"
          :action="currentAction"
        />

        <ThoughtDumpEmbeddedComposer
          v-else-if="currentAction.type === 'thought_dump'"
          v-model="textDraft"
          :prompt="currentAction.prompt"
          :max-length="currentAction.maxLength ?? 2000"
          @input-method-change="textInputMethod = $event"
        />

        <ProgramAiChatAction
          v-else-if="currentAction.type === 'ai_chat_session'"
          ref="aiChatActionRef"
          :action="currentAction"
          @complete="markCurrentPracticeComplete"
        />

        <ProgramStructuredFormAction
          v-else-if="currentAction.type === 'structured_form'"
          v-model="structuredFormDraft"
          :action="currentAction"
        />

        <ProgramGuidedStepsAction
          v-else-if="
            currentAction.type === 'guided_steps' &&
            !isAssessmentPromptAction(currentAction)
          "
          v-model="guidedStepsDraft"
          :action="currentAction"
        />

        <ProgramAssessmentPromptAction
          v-else-if="
            currentAction.type === 'guided_steps' &&
            isAssessmentPromptAction(currentAction)
          "
          :action="currentAction"
          :program-slug="slug"
          :step="step"
          :attempt-id="response.attempt.id"
          :completed-attempt-id="returnedAssessmentAttemptId"
          :skipped="isCurrentAssessmentPromptSkipped"
          @skip="skipAssessmentPrompt"
          @complete="onAssessmentPromptComplete"
        />

        <ProgramWeeklyCheckAction
          v-else-if="currentAction.type === 'weekly_check'"
          v-model="weeklyCheckDraft"
          :action="currentAction"
        />

        <!-- Backward-compat fallback: action нового типа, который этот клиент
             не знает (например, добавится в будущем релизе). Пользователь не
             залипает на пустой странице — открываем deeplink в обычный чат.
             См. retention/retention_long_term_strategy.md и §8.5. -->
        <div v-else class="glass-deep xs:space-y-3 space-y-1 p-4 text-center">
          <p class="text-sm leading-relaxed text-foreground/75">
            Это упражнение лучше открыть в чате с ассистентом.
          </p>
          <NuxtLink
            :to="unknownActionDeeplink"
            class="inline-flex min-h-10 items-center justify-center rounded-full bg-foreground px-5 py-1.5 text-sm font-semibold text-background hover:bg-foreground/90"
          >
            Открыть в чате
          </NuxtLink>
        </div>
      </section>

      <section
        class="fixed inset-x-1 bottom-[100px] z-40 mx-auto flex max-w-[768px] items-center gap-2"
      >
        <button
          v-if="canGoBack"
          type="button"
          class="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition hover:bg-foreground/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isSaving"
          :aria-label="'Вернуться к предыдущему упражнению'"
          @click="goToPreviousAction"
        >
          <IconArrowLeft class="h-5 w-5" />
        </button>
        <button
          type="button"
          class="relative flex min-h-12 flex-1 items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="nextDisabled || isSaving"
          :aria-busy="isSaving"
          @click="completeCurrentAction"
        >
          <ButtonLoader v-if="isSaving" />
          <span :class="{ invisible: isSaving }">{{ primaryButtonLabel }}</span>
        </button>
      </section>
    </template>

    <section v-else class="xs:space-y-3 space-y-1">
      <div class="glass-deep h-40 animate-pulse" />
      <div class="glass-deep h-64 animate-pulse" />
    </section>

    <!-- Финальный шаг программы: ОТДЕЛЬНЫЙ flow «Сад завершён».
         1. Сразу после complete-step → overlay «Готовится итоговый отчёт»
            (polling /summary-status каждые 2 сек, через 15 сек — CTA «Уйти в Оранжерею»).
         2. Когда отчёт готов → закрываем preparing, открываем report sheet с готовым
            summaryText + метриками.
         3. При закрытии sheet'а или при timeout/failed/leave — переход на /garden.
         Старый «Сад завершён» card-screen с кнопками «В Оранжерею / На главную»
         больше не используется — он недодавал контент пользователю.
         См. retention/implementation_plan.md, сессия 25 . -->
    <ProgramFinalReportPreparing
      :open="preparingOpen"
      :visible="preparingVisible"
      :force-refresh="finaleIsReplayRefresh"
      :program-slug="slug"
      :plant-title="completedProgram?.title || null"
      :plant-image-src="completedPlantImageSrc"
      @ready="onReportReady"
      @failed="onPreparingFailed"
      @leave="onPreparingLeave"
    />
    <GardenPlantReportSheet
      v-model:open="reportSheetOpen"
      :plant="completedPlantForSheet"
      :initial-summary-text="reportData?.summaryText ?? null"
      :initial-metrics="reportData?.metrics ?? null"
      @update:open="onReportSheetOpenChange"
    />

    <!-- Промежуточный отчёт за неделю (после weekly_check на 7/14/21).
         Срабатывает автоматически из watch'а isCompleted. После закрытия sheet
         юзер видит обычный success-экран шага и идёт дальше. Отчёт остаётся
         в БД и доступен через /garden. -->
    <ProgramCheckpointReportPreparing
      :open="checkpointPreparingOpen"
      :visible="checkpointPreparingVisible"
      :program-slug="slug"
      :checkpoint-step="checkpointStep"
      @ready="onCheckpointReady"
      @failed="onCheckpointFailed"
      @skip="onCheckpointSkip"
    />
    <!-- Промежуточный отчёт показываем тем же GardenPlantReportSheet, что и
         итог сада, открывая его на нужной точке пути (initial-selected-step).
         Это даёт промежуточной сводке тот же дизайн и единый источник данных
         (timeline), вместо отдельного компонента с расходящимся видом. -->
    <GardenPlantReportSheet
      :open="checkpointSheetOpen"
      :plant="checkpointPlantForSheet"
      :initial-summary-text="checkpointData?.summaryText ?? null"
      :initial-selected-step="checkpointStep"
      @update:open="onCheckpointSheetOpenChange"
    />

    <DailyLimitInfoDialog v-model:open="dailyLimitDialogOpen" />

    <TrialUpsellModal
      :open="showTrialUpsellModal"
      :milestone="trialUpsellMilestone"
      @update:open="showTrialUpsellModal = $event"
      @confirm="handleTrialUpsellConfirm"
      @dismiss="handleTrialUpsellDismiss"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import IconArrowLeft from '~icons/lucide/arrow-left';
import IconPartyPopper from '~icons/lucide/party-popper';
import PageHeader from '@/app/components/PageHeader.vue';
import AssistantVolumeControl from '@/app/components/realtime/AssistantVolumeControl.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import ProgramBreathPracticeAction from '@/app/components/programs/ProgramBreathPracticeAction.vue';
import ProgramJournalEntryAction from '@/app/components/programs/ProgramJournalEntryAction.vue';
import ProgramMeditationAction from '@/app/components/programs/ProgramMeditationAction.vue';
import ProgramQuickHelpAction from '@/app/components/programs/ProgramQuickHelpAction.vue';
import ProgramReflectionAction from '@/app/components/programs/ProgramReflectionAction.vue';
import ProgramMicroReflectionAction from '@/app/components/programs/ProgramMicroReflectionAction.vue';
import ProgramRatingScaleAction from '@/app/components/programs/ProgramRatingScaleAction.vue';
import ProgramNextRouteChoiceAction from '@/app/components/programs/ProgramNextRouteChoiceAction.vue';
import ProgramStepPlantReward from '@/app/components/programs/ProgramStepPlantReward.vue';
import ProgramStepHeader from '@/app/components/programs/ProgramStepHeader.vue';
import ProgramHelpHint from '@/app/components/programs/ProgramHelpHint.vue';
import ProgramAiChatAction from '@/app/components/programs/ProgramAiChatAction.vue';
import ProgramStructuredFormAction from '@/app/components/programs/ProgramStructuredFormAction.vue';
import ProgramGuidedStepsAction from '@/app/components/programs/ProgramGuidedStepsAction.vue';
import ProgramAssessmentPromptAction from '@/app/components/programs/ProgramAssessmentPromptAction.vue';
import ProgramWeeklyCheckAction from '@/app/components/programs/ProgramWeeklyCheckAction.vue';
import ProgramFinalReportPreparing from '@/app/components/programs/ProgramFinalReportPreparing.vue';
import ProgramCheckpointReportPreparing from '@/app/components/programs/ProgramCheckpointReportPreparing.vue';
import DailyLimitInfoDialog from '@/app/components/programs/DailyLimitInfoDialog.vue';
import TrialUpsellModal from '@/app/components/subscription/TrialUpsellModal.vue';
import { useTrialUpsell } from '@/app/composables/useTrialUpsell';
import GardenPlantReportSheet from '@/app/components/garden/GardenPlantReportSheet.vue';
import ThoughtDumpEmbeddedComposer from '@/app/components/quick-help/ThoughtDumpEmbeddedComposer.vue';
import { useAPI } from '@/app/composables/useAPI';
import { useCelebrationConfetti } from '@/app/composables/useCelebrationConfetti';
import { useProgramDailyLimit } from '@/app/composables/useProgramDailyLimit';
import {
  useSceneAudioFocus,
  type SceneAudioFocusLock,
} from '@/app/composables/useSceneAudioFocus';
import { useToast } from '@/app/composables/useToast';
import {
  getRetentionPlantImageSrc,
  getRetentionPlantStateIndex,
} from '@/app/utils/retentionPlant';
import {
  buildRoadmapTimedPracticeRecoveryId,
  completeTimedPracticeRecoveryRecord,
  createTimedPracticeRecoveryRecord,
  getTimedPracticeElapsedMs,
  getTimedPracticeRecoveryRecords,
  hasTimedPracticeReachedRequiredTime,
  removeTimedPracticeRecoveryRecord,
  upsertTimedPracticeRecoveryRecord,
  type TimedPracticeRecoveryRecord,
} from '@/app/utils/timedPracticeRecovery';
import type { GardenPlantItemDto } from '@/shared/dto/garden';
import type { CheckpointStructuredDataDto } from '@/shared/dto/program-checkpoint';
import type {
  MoodCheckinMood,
  ProgramOverviewDto,
  ProgramStepActionStateDto,
  ProgramStepCompleteResponseDto,
  ProgramStepStartResponseDto,
  ProgramStructuredFormFieldDto,
  ProgramWeeklyCheckQuestionDto,
  TrialUpsellPromptDto,
} from '@/shared/dto/retention';

const route = useRoute();
const response = ref<ProgramStepStartResponseDto | null>(null);
const actionIndex = ref(0);
const selectedMood = ref<MoodCheckinMood | null>(null);
const textDraft = ref('');
const textInputMethod = ref<'text' | 'voice' | 'mixed'>('text');
const reflectionChips = ref<string[]>([]);
const ratingScaleValue = ref<number | null>(null);
const selectedRouteChoice = ref<string | null>(null);
const structuredFormDraft = ref<Record<string, unknown>>({});
const guidedStepsDraft = ref<string[]>([]);
const weeklyCheckDraft = ref<Record<string, unknown>>({});
const assessmentPromptSkippedActionIds = ref<Set<string>>(new Set());
// attemptId пройденного встроенного опросника, по id action'а. Заполняется,
// когда AssessmentRunner внутри шага эмитит complete (без редиректа на страницу
// практик). Используется при завершении action'а как assessmentAttemptId.
const assessmentCompletedAttemptByActionId = ref<Map<string, number>>(
  new Map()
);
const isSaving = ref(false);
const isCompleted = ref(false);
const completionRewardGranted = ref(false);
const completedProgram = ref<ProgramOverviewDto | null>(null);
const confettiLaunched = ref(false);
const completedActionIds = ref<Set<string>>(new Set());
const showResumeHint = ref(false);
let resumeHintTimer: ReturnType<typeof setTimeout> | null = null;
const unlockRemainingSeconds = ref(0);
const unlockAccumulatedMs = ref(0);
const unlockStartedAtMs = ref<number | null>(null);
const unlockActionId = ref<string | null>(null);
let unlockTimer: number | null = null;
let pageIsUnloading = false;
let removeRecoveryVisibilityListener: (() => void) | null = null;
let removeRecoveryPagehideListener: (() => void) | null = null;
let removeRecoveryBeforeUnloadListener: (() => void) | null = null;
let removeRecoveryAppStateListener: (() => Promise<void>) | null = null;
// Ref на embedded AI-chat (если текущий action — ai_chat_session).
// Нужен, чтобы прочитать eligibility и вызвать finalize при нажатии «Дальше».
const aiChatActionRef = ref<InstanceType<typeof ProgramAiChatAction> | null>(
  null
);
const { launchStepCompletionConfetti } = useCelebrationConfetti();
const dailyLimit = useProgramDailyLimit();
const dailyLimitDialogOpen = ref(false);

// Промо-paywall привязки карты в триале (контрольные точки 1/5/10 шага).
// Решение «показывать ли» приходит с бэка в ответе завершения шага.
const trialUpsell = useTrialUpsell();
const showTrialUpsellModal = ref(false);
const trialUpsellPrompt = ref<TrialUpsellPromptDto | null>(null);
const trialUpsellMilestone = ref(0);
const upsellPendingNavigate = ref<(() => void) | null>(null);
let upsellResolved = false;

const slug = computed(() => String(route.params.slug || '').trim());
const step = computed(() => Number(route.params.step));
const currentAction = computed<ProgramStepActionStateDto | null>(
  () => response.value?.attempt.actions[actionIndex.value] || null
);
const currentActionCompletionDelaySeconds = computed(() => {
  return getActionCompletionDelaySeconds(currentAction.value);
});

// Приглушение фоновой сцены на аудио-шагах roadmap.
// Переиспользуем глобальный scene-audio-focus (тот же механизм, что в ИИ-чате
// и голосовой диктовке): он делает плавный fade-out фона при захвате lock и
// fade-in при release. Медитация и realtime-голос глушат фон сами через свои
// плееры, поэтому здесь только дыхание/quick-help, у которых своего ducking нет.
const SCENE_DUCKING_ACTION_TYPES = new Set<ProgramStepActionStateDto['type']>([
  'breathing',
  'quick_help_breathing',
  'quick_help_grounding',
  'quick_help_tension',
]);
const sceneAudioFocus = useSceneAudioFocus();
const sceneDuckingLock = ref<SceneAudioFocusLock | null>(null);
let sceneDuckingDisposed = false;

const isSceneDuckingAction = computed(() => {
  const action = currentAction.value;
  return Boolean(action && SCENE_DUCKING_ACTION_TYPES.has(action.type));
});

watch(
  isSceneDuckingAction,
  (shouldDuck) => {
    if (shouldDuck) {
      if (sceneDuckingLock.value) return;
      void sceneAudioFocus
        .acquire('roadmap-audio-step')
        .then((lock) => {
          // Шаг могли успеть переключить или страницу размонтировать, пока
          // резолвился lock — тогда сразу отпускаем, иначе фон останется
          // приглушённым на не-аудио шаге или вообще навсегда после ухода.
          if (sceneDuckingDisposed || !isSceneDuckingAction.value) {
            void lock.release();
          } else {
            sceneDuckingLock.value = lock;
          }
        })
        .catch(() => {
          /* fade фоновой сцены не критичен для прохождения шага */
        });
    } else {
      const lock = sceneDuckingLock.value;
      sceneDuckingLock.value = null;
      void lock?.release();
    }
  },
  { immediate: true }
);
const returnedAssessmentAttemptId = computed(() => {
  const action = currentAction.value;
  if (!action || !isAssessmentPromptAction(action)) return null;
  return assessmentCompletedAttemptByActionId.value.get(action.id) ?? null;
});
const isCurrentAssessmentPromptSkipped = computed(() => {
  const action = currentAction.value;
  return Boolean(
    action && assessmentPromptSkippedActionIds.value.has(action.id)
  );
});

function getActionCompletionDelaySeconds(
  action: ProgramStepActionStateDto | null | undefined
) {
  if (!action || !isTimedPracticeAction(action)) return null;
  if (
    typeof action.completionDelaySeconds === 'number' &&
    Number.isFinite(action.completionDelaySeconds)
  ) {
    return Math.max(1, Math.floor(action.completionDelaySeconds));
  }
  if (action.completionDelaySeconds === null) return null;
  if (
    typeof action.durationSeconds === 'number' &&
    Number.isFinite(action.durationSeconds)
  ) {
    return Math.max(1, Math.floor(action.durationSeconds));
  }
  return null;
}

// === Final report flow (последний шаг программы → итоговый отчёт) ===
// preparingOpen: показываем full-screen overlay «Готовится отчёт» с polling'ом.
// reportSheetOpen: после получения отчёта — full-screen sheet с markdown-отчётом.
// reportData: payload готового отчёта (summary + metrics + plantId), передаётся
// в GardenPlantReportSheet чтобы избежать повторного fetch'а.
type ReportReadyPayload = {
  plantId: number;
  summaryText: string;
  metrics: {
    durationDays: number;
    completedSteps: number;
    journalEntriesCount: number;
    aiChatSessionsCount: number;
    reflectionsCount: number;
  } | null;
};
const preparingOpen = ref(false);
// Видимость оверлея финального отчёта. Генерация (polling) идёт по
// preparingOpen, а сам оверлей показываем только после завершения анимации
// цветка — см. onPlantFlyoutComplete/maybeRevealFinalReport.
const preparingVisible = ref(false);
// Анимация цветка на финале завершена (flyout доигран/пропущен).
const finalFlyoutDone = ref(false);
// Минимальная длительность показа оверлея «Готовится отчёт» уже прошла. Нужна,
// чтобы юзер всегда успел увидеть фазу анализа данных, даже если отчёт
// сгенерировался быстро (иначе sheet открывался мгновенно поверх анимации
// цветка, и анализ визуально проскакивал).
const finalPreparingMinElapsed = ref(false);
const FINAL_PREPARING_MIN_MS = 2600;
let finalPreparingMinTimer: ReturnType<typeof setTimeout> | null = null;
// Финальный шаг пройден повторно (replay): отчёт пересобираем по свежим данным
// через force-refresh, без анимации цветка (на replay её нет).
const finaleIsReplayRefresh = ref(false);
const reportSheetOpen = ref(false);
const reportData = ref<ReportReadyPayload | null>(null);

// === Checkpoint report flow (промежуточные отчёты после weekly_check на 7/14/21) ===
// Триггерится в watch'е isCompleted, если шаг — чекпоинт и в actions был weekly_check.
// Открывает короткий preparing-overlay, затем GardenPlantReportSheet на точке.
const checkpointPreparingOpen = ref(false);
// Видимость оверлея промежуточного отчёта (аналогично preparingVisible).
const checkpointPreparingVisible = ref(false);
// Анимация цветка для чекпоинта завершена.
const checkpointFlyoutDone = ref(false);
const checkpointSheetOpen = ref(false);
const checkpointStep = ref<7 | 14 | 21 | null>(null);
const checkpointData = ref<{
  summaryText: string;
  structuredData: CheckpointStructuredDataDto;
} | null>(null);

// Имитация GardenPlantItemDto для GardenPlantReportSheet (он принимает этот тип
// для отображения hero/изображения/savedThoughts). У нас полного DTO нет на этой
// странице — собираем минимально необходимое из completedProgram.
const completedPlantImageSrc = computed<string | null>(() => {
  const program = completedProgram.value;
  if (!program) return null;
  // Финальная стадия растения = stateIndex 15 (1-based); helper использует 0-based.
  return getRetentionPlantImageSrc(14, program.plantSetSlug ?? 'orchid');
});

const completedPlantForSheet = computed<GardenPlantItemDto | null>(() => {
  const program = completedProgram.value;
  const data = reportData.value;
  if (!program || !data) return null;
  return {
    programSlug: program.slug,
    title: program.title,
    plantSetSlug: program.plantSetSlug ?? 'orchid',
    stateIndex: 15,
    completedAt: new Date().toISOString(),
    summaryText: data.summaryText,
    savedThoughtIds: [],
    savedThoughts: [],
  } as GardenPlantItemDto;
});

// Имитация plant для промежуточного отчёта (GardenPlantReportSheet открывается
// на точке пути checkpointStep). Растение в hero показываем на ТЕКУЩЕЙ стадии
// роста (путь ещё не завершён), поэтому stateIndex считаем из пройденных шагов,
// а plantSetSlug берём из completedProgram (приходит в ответе /complete).
// completedAt = null — сад ещё не закончен.
const checkpointPlantForSheet = computed<GardenPlantItemDto | null>(() => {
  const program = completedProgram.value;
  const data = checkpointData.value;
  if (!program || !data) return null;
  const stateIndex = getRetentionPlantStateIndex(
    program.completedSteps,
    program.totalSteps
  );
  return {
    programSlug: program.slug,
    title: program.title,
    plantSetSlug: program.plantSetSlug ?? 'orchid',
    // stateIndex в DTO 1-based (0 — пусто), helper отдаёт 0-based индекс кадра.
    stateIndex: stateIndex + 1,
    completedAt: null,
    summaryText: data.summaryText,
    savedThoughtIds: [],
    savedThoughts: [],
  } as GardenPlantItemDto;
});

const actionSectionClass = computed(() =>
  currentAction.value && isFramelessAction(currentAction.value)
    ? 'xs:space-y-3 space-y-1 h-full overflow-auto'
    : 'glass-deep xs:space-y-3 space-y-1 p-3'
);

// AI-чат внутри roadmap самостоятельно ограничивает высоту через maxHeight
// в ProgramAiChatAction (см. там) и держит композер над fixed-кнопкой
// step runner'а. Большой pb родителя лишь добавлял внизу пустое поле под
// чатом, поэтому для ai_chat оставляем только зазор 60px, а у остальных
// action — 160px (резерв под BottomNav + fixed-кнопку).
const rootPaddingClass = computed(() =>
  currentAction.value?.type === 'ai_chat_session' ? 'pb-[60px]' : 'pb-[160px]'
);

// Известные action-типы. Всё что не в списке — рендерится как backward-compat
// fallback (deeplink в `/chat`). См. retention/retention_long_term_strategy.md
const KNOWN_ACTION_TYPES: Array<ProgramStepActionStateDto['type']> = [
  'mood_checkin',
  'breathing',
  'meditation',
  'quick_help_grounding',
  'quick_help_breathing',
  'quick_help_tension',
  'thought_dump',
  'ai_reflection',
  'journal_entry',
  'micro_reflection',
  'rating_scale',
  'next_route_choice',
  'ai_chat_session',
  'structured_form',
  'guided_steps',
  'weekly_check',
];

const ACTION_TYPES_WITH_INTERNAL_TITLE = new Set<
  ProgramStepActionStateDto['type']
>([
  'ai_reflection',
  'journal_entry',
  'micro_reflection',
  'rating_scale',
  'next_route_choice',
  'thought_dump',
  'structured_form',
  'weekly_check',
  // ai_chat_session: mini-header («Короткий разговор / название») не показываем,
  // потому что тема разговора теперь подаётся как первое сообщение ассистента
  // в самом чате (см. ProgramAiChatAction → seedIntroMessage). Это освобождает
  // верх экрана и оставляет больше места для самой переписки на мобильных.
  'ai_chat_session',
]);

const isUnknownAction = computed(() => {
  const action = currentAction.value;
  if (!action) return false;
  return !KNOWN_ACTION_TYPES.includes(action.type);
});

const unknownActionDeeplink = computed(() => {
  const topic = currentAction.value?.topicPrompt || currentAction.value?.prompt;
  if (typeof topic === 'string' && topic.trim().length > 0) {
    return `/chat?topic=${encodeURIComponent(topic.trim().slice(0, 500))}`;
  }
  return '/chat';
});

const showActionIntro = computed(() => {
  const action = currentAction.value;
  if (!action) return false;
  if (!action.title) return false;
  if (action.type === 'guided_steps' && action.formKind === 'step_intro') {
    return false;
  }
  // Assessment prompt имеет собственный заголовок внутри компонента
  if (
    action.type === 'guided_steps' &&
    action.formKind === 'assessment_prompt'
  ) {
    return false;
  }
  return !ACTION_TYPES_WITH_INTERNAL_TITLE.has(action.type);
});

const isCurrentActionCompleted = computed(() => {
  const action = currentAction.value;
  if (!action) return false;
  return (
    action.status === 'completed' || completedActionIds.value.has(action.id)
  );
});

const hasUnlockProgress = computed(() => {
  const action = currentAction.value;
  if (!action || unlockActionId.value !== action.id) return false;
  return unlockAccumulatedMs.value > 0 || unlockStartedAtMs.value !== null;
});

const isUnlockTimerRunning = computed(() => {
  const action = currentAction.value;
  return Boolean(
    action && unlockActionId.value === action.id && unlockStartedAtMs.value
  );
});

const unlockRemainingLabel = computed(() =>
  formatActionTimerLabel(unlockRemainingSeconds.value)
);

const nextDisabled = computed(() => {
  if (!currentAction.value) return true;
  // Неизвестный action-тип: рендерим fallback с deeplink в /chat. Пропустить
  // через CTA «Дальше» можно всегда — иначе пользователь упрётся в тупик.
  if (isUnknownAction.value) return false;
  // Формы с обязательными полями валидируем всегда — даже если action ранее
  // был completed (replay/повтор). Это блокирует кнопку «Завершить шаг» пока
  // поля пусты, независимо от статуса action на сервере.
  if (currentAction.value.type === 'structured_form') {
    return (
      currentAction.value.required !== false &&
      !isStructuredFormComplete(currentAction.value, structuredFormDraft.value)
    );
  }
  if (currentAction.value.type === 'weekly_check') {
    // Гейт строится по флагам required самих вопросов, а НЕ по action.required.
    // Серверный блюпринт weeklyCheckAction дефолтит action.required в false
    // (исторически, чтобы не блокировать roadmap-completion), но вопросы внутри
    // помечены «Обязательно» (minSelected/rating). isWeeklyCheckComplete уже
    // возвращает true, если обязательных вопросов нет, — значит такой weekly_check
    // остаётся пропускаемым. Опираться на action.required нельзя: иначе кнопка
    // «Завершить шаг» активна при пустой форме.
    return !isWeeklyCheckComplete(currentAction.value, weeklyCheckDraft.value);
  }
  if (currentAction.value.type === 'guided_steps') {
    if (isAssessmentPromptAction(currentAction.value)) {
      // Кнопку шага держим заблокированной, пока юзер не пройдёт встроенный
      // опросник или явно не нажмёт «Пропустить». Это не даёт случайно
      // проскочить шаг мимо опросника нижней кнопкой во время ответов.
      return !(
        returnedAssessmentAttemptId.value ||
        isCurrentAssessmentPromptSkipped.value
      );
    }
    return (
      currentAction.value.required !== false &&
      !isGuidedStepsComplete(currentAction.value, guidedStepsDraft.value)
    );
  }
  if (isCurrentActionCompleted.value) return false;
  if (currentAction.value.type === 'mood_checkin') return !selectedMood.value;
  if (requiresPracticeCompletion(currentAction.value)) {
    return !isCurrentActionCompleted.value;
  }
  if (currentAction.value.type === 'ai_chat_session') {
    // CTA «Дальше» залочен пока eligibility не выполнена
    // (см. retention/retention_long_term_strategy.md).
    // Пока ChatRoom не смонтирован (первый рендер) — тоже disabled.
    // ВАЖНО: БЕЗ `.value` — Vue 3.5+ auto-unwrap'ает refs в defineExpose
    // (баг сессий 17-18, обнаружен в сессии 19).
    return !(aiChatActionRef.value?.isEligible === true);
  }
  if (currentAction.value.type === 'rating_scale') {
    return (
      currentAction.value.required !== false && ratingScaleValue.value === null
    );
  }
  if (currentAction.value.type === 'next_route_choice') {
    return (
      currentAction.value.required !== false &&
      selectedRouteChoice.value === null
    );
  }
  if (
    currentAction.value.type === 'ai_reflection' ||
    currentAction.value.type === 'micro_reflection' ||
    currentAction.value.type === 'journal_entry' ||
    currentAction.value.type === 'thought_dump'
  ) {
    if (
      currentAction.value.type === 'ai_reflection' ||
      currentAction.value.type === 'micro_reflection'
    ) {
      if (currentAction.value.required === false) return false;
      return (
        textDraft.value.trim().length < 2 && reflectionChips.value.length === 0
      );
    }
    if (currentAction.value.required === false) return false;
    return textDraft.value.trim().length < 2;
  }
  return false;
});

const completionText = computed(() =>
  completionRewardGranted.value
    ? 'Отличная работа. Капли добавлены к сегодняшнему прогрессу.'
    : 'Отличная работа. Повтор засчитан без изменения основного прогресса.'
);

// Финальный шаг программы: пользователь только что завершил весь Сад.
// Серверный хук в completeProgramStep уже вставил запись в user_plants,
// поэтому достаточно показать иной success-экран с CTA в /garden.
const isProgramJustCompleted = computed(() => {
  if (!completionRewardGranted.value) return false;
  const program = completedProgram.value;
  if (!program) return false;
  return program.completedSteps >= program.totalSteps;
});

// Повторно пройден ПОСЛЕДНИЙ шаг уже завершённого сада (replay). Награды нет
// (поэтому isProgramJustCompleted=false), но данные финального шага обновились —
// значит пересобираем итоговый отчёт по свежим данным. Только последний шаг:
// перепрохождение средних шагов отчёт не трогает.
const isFinalStepReplayJustCompleted = computed(() => {
  if (!isCompleted.value) return false;
  if (completionRewardGranted.value) return false; // первичное завершение — отдельный flow
  const program = completedProgram.value;
  if (!program) return false;
  const stepNumber = response.value?.step?.step ?? 0;
  return (
    stepNumber >= program.totalSteps &&
    program.completedSteps >= program.totalSteps
  );
});

// На success-экране показываем CTA «Следующий шаг», если у программы есть
// следующий шаг (текущий не финальный). При повторе уже пройденного шага
// следующий тоже может быть completed — открываем его в replay-режиме.
const nextStepNumber = computed<number | null>(() => {
  if (!response.value) return null;
  const next = response.value.step.step + 1;
  if (next > response.value.program.totalSteps) return null;
  return next;
});

const hasNextStep = computed(() => nextStepNumber.value !== null);

const nextStepIsReplay = computed(() => {
  const next = nextStepNumber.value;
  const program = completedProgram.value;
  if (!next || !program) return false;
  return next <= program.completedSteps;
});

const isFinalReportTriggerAction = computed(() => {
  const action = currentAction.value;
  const attempt = response.value?.attempt;
  if (!action || !attempt) return false;
  return (
    action.type === 'weekly_check' &&
    action.placement === 'before_final_completion' &&
    actionIndex.value === attempt.actions.length - 1
  );
});

const primaryButtonLabel = computed(() => {
  if (!response.value) return 'Дальше';
  if (isCurrentActionCompleted.value) {
    if (isFinalReportTriggerAction.value) return 'Сформировать итоговый отчёт';
    return actionIndex.value === response.value.attempt.actions.length - 1
      ? 'Завершить шаг'
      : 'Следующий';
  }
  if (
    currentAction.value &&
    requiresPracticeCompletion(currentAction.value) &&
    !isCurrentActionCompleted.value
  ) {
    if (currentActionCompletionDelaySeconds.value) {
      if (!hasUnlockProgress.value) return 'Запусти практику';
      if (!isUnlockTimerRunning.value) {
        return `Продолжи практику · ${unlockRemainingLabel.value}`;
      }
      return `Можно дальше через ${unlockRemainingLabel.value}`;
    }
    return 'Заверши практику';
  }
  if (currentAction.value?.type === 'ai_chat_session') {
    // Для AI-чата CTA остаётся «Дальше / Завершить шаг» (как у других action),
    // но disabled пока eligibility не выполнена — лейбл disabled-кнопки добавляет
    // подсказку «Продолжи разговор» через хелпер ниже.
    if (!(aiChatActionRef.value?.isEligible === true)) {
      return 'Продолжи разговор';
    }
  }
  if (
    (currentAction.value?.type === 'ai_reflection' ||
      currentAction.value?.type === 'micro_reflection') &&
    textDraft.value.trim().length < 2 &&
    reflectionChips.value.length === 0 &&
    currentAction.value.required !== false
  ) {
    return 'Следующий';
  }
  if (
    currentAction.value?.type === 'rating_scale' &&
    ratingScaleValue.value === null
  ) {
    return 'Поставь оценку';
  }
  if (
    currentAction.value?.type === 'next_route_choice' &&
    selectedRouteChoice.value === null
  ) {
    return 'Выбери маршрут';
  }
  if (
    currentAction.value?.type === 'structured_form' &&
    currentAction.value.required !== false &&
    !isStructuredFormComplete(currentAction.value, structuredFormDraft.value)
  ) {
    return 'Заполни обязательные поля';
  }
  if (
    currentAction.value?.type === 'guided_steps' &&
    isAssessmentPromptAction(currentAction.value)
  ) {
    if (returnedAssessmentAttemptId.value) return 'Сохранить результат';
    return 'Продолжить';
  }
  if (
    currentAction.value?.type === 'guided_steps' &&
    !isAssessmentPromptAction(currentAction.value) &&
    currentAction.value.required !== false &&
    !isGuidedStepsComplete(currentAction.value, guidedStepsDraft.value)
  ) {
    if (currentAction.value.formKind === 'support_request_script') {
      return 'Заполни просьбу';
    }
    return 'Отметь шаги практики';
  }
  if (
    currentAction.value?.type === 'weekly_check' &&
    !isWeeklyCheckComplete(currentAction.value, weeklyCheckDraft.value)
  ) {
    return 'Ответь на вопросы';
  }
  if (
    (currentAction.value?.type === 'journal_entry' ||
      currentAction.value?.type === 'thought_dump') &&
    textDraft.value.trim().length < 2 &&
    currentAction.value.required !== false
  ) {
    return 'Добавь запись';
  }
  if (isFinalReportTriggerAction.value) return 'Сформировать итоговый отчёт';
  return actionIndex.value === response.value.attempt.actions.length - 1
    ? 'Завершить шаг'
    : 'Следующий';
});

const moods: Array<{
  value: MoodCheckinMood;
  emoji: string;
  class: string;
}> = [
  {
    value: 'very_bad',
    emoji: '😣',
    class: 'border-rose-300/40 bg-rose-400/20',
  },
  { value: 'sad', emoji: '😟', class: 'border-amber-300/40 bg-amber-300/20' },
  { value: 'neutral', emoji: '😐', class: 'border-white/25 bg-white/10' },
  {
    value: 'good',
    emoji: '🙂',
    class: 'border-emerald-200/40 bg-emerald-300/20',
  },
  { value: 'great', emoji: '😊', class: 'border-teal-200/50 bg-teal-300/20' },
];

function isQuickHelpAction(action: ProgramStepActionStateDto) {
  return (
    action.type === 'quick_help_grounding' ||
    action.type === 'quick_help_breathing' ||
    action.type === 'quick_help_tension'
  );
}

function isTimedPracticeAction(action: ProgramStepActionStateDto) {
  return (
    action.type === 'breathing' ||
    action.type === 'quick_help_breathing' ||
    action.type === 'quick_help_tension' ||
    action.type === 'meditation'
  );
}

function isFramelessAction(action: ProgramStepActionStateDto) {
  return (
    action.type === 'breathing' ||
    action.type === 'quick_help_grounding' ||
    action.type === 'quick_help_breathing' ||
    action.type === 'quick_help_tension' ||
    action.type === 'meditation' ||
    // AI-чат — embedded ChatRoom уже содержит свою glass-deep обёртку.
    action.type === 'ai_chat_session'
  );
}

function isAssessmentPromptAction(action: ProgramStepActionStateDto) {
  return (
    action.type === 'guided_steps' && action.formKind === 'assessment_prompt'
  );
}

function requiresPracticeCompletion(action: ProgramStepActionStateDto) {
  // Медитацию НЕ требуем «дослушать»: гайд-аудио строго зависит от звука
  // (динамик/наушники), и юзер в офисе или транспорте без наушников иначе
  // застревает на шаге. Поэтому кнопка продолжения для медитации всегда
  // активна — шаг завершается штатно, без обязательного проигрывания.
  // Дыхательные и quick-help практики остаются обязательными: они выполняются
  // по визуальному пейсеру, молча, и доступны в любой обстановке.
  return (
    action.type === 'breathing' ||
    action.type === 'quick_help_grounding' ||
    action.type === 'quick_help_breathing' ||
    action.type === 'quick_help_tension'
  );
}

const fallbackWeeklyCheckQuestions: ProgramWeeklyCheckQuestionDto[] = [
  {
    id: 'anxiety_level_last_days',
    type: 'rating_scale',
    question: 'Насколько тревога мешала тебе в последние дни?',
    min: 0,
    max: 10,
  },
  {
    id: 'main_change',
    type: 'choice',
    question: 'Что стало заметнее за это время? Можно выбрать несколько.',
    mode: 'multiple',
    minSelected: 1,
    maxSelected: 3,
    exclusiveOptionIds: ['no_change_yet', 'worse'],
    options: [
      { id: 'less_body_tension', label: 'Меньше напряжения в теле' },
      { id: 'notice_thoughts', label: 'Лучше замечаю мысли' },
      { id: 'more_pause', label: 'Чаще получается делать паузу' },
      { id: 'less_avoidance', label: 'Меньше избегаю' },
      { id: 'no_change_yet', label: 'Пока без заметных изменений' },
      { id: 'worse', label: 'Стало тяжелее' },
    ],
  },
  {
    id: 'support_need',
    type: 'choice',
    question: 'Как идут дела на этой неделе?',
    mode: 'single',
    minSelected: 1,
    maxSelected: 1,
    options: [
      { id: 'better', label: 'Лучше, чем раньше' },
      { id: 'usual', label: 'Похоже на обычное состояние' },
      { id: 'harder', label: 'Тяжелее, чем хотелось бы' },
    ],
  },
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasTextValue(value: unknown, minLength = 2) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function choiceSelectionCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.length > 0)
      .length;
  }
  return typeof value === 'string' && value.length > 0 ? 1 : 0;
}

function isChoiceComplete(params: {
  value: unknown;
  mode?: 'single' | 'multiple';
  minSelected?: number;
  maxSelected?: number;
}) {
  const count = choiceSelectionCount(params.value);
  const minSelected = params.minSelected ?? 1;
  const maxSelected =
    params.maxSelected ??
    (params.mode === 'single' ? 1 : Number.POSITIVE_INFINITY);
  return count >= minSelected && count <= maxSelected;
}

function isRatingComplete(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStructuredFieldComplete(
  field: ProgramStructuredFormFieldDto,
  value: unknown
) {
  if (field.type === 'rating_scale') return isRatingComplete(value);
  if (field.type === 'choice' || field.type === 'experiment_status') {
    return isChoiceComplete({
      value,
      mode: field.mode,
      minSelected: field.minSelected,
      maxSelected: field.maxSelected,
    });
  }
  return hasTextValue(value);
}

function isStructuredFieldVisible(
  field: ProgramStructuredFormFieldDto,
  value: Record<string, unknown>
): boolean {
  if (!field.visibleWhen) return true;
  const { fieldId, valueIn } = field.visibleWhen;
  const current = value[fieldId];
  if (Array.isArray(current)) return current.some((v) => valueIn.includes(v));
  return typeof current === 'string' && valueIn.includes(current);
}

function isStructuredFormComplete(
  action: ProgramStepActionStateDto,
  value: Record<string, unknown>
) {
  const requiredFields = (action.fields ?? []).filter(
    (field) =>
      field.required !== false && isStructuredFieldVisible(field, value)
  );
  if (requiredFields.length === 0) return true;
  return requiredFields.every((field) =>
    isStructuredFieldComplete(field, value[field.id])
  );
}

function isGuidedStepsComplete(
  action: ProgramStepActionStateDto,
  value: string[]
) {
  const requiredSteps = (action.steps ?? []).filter(
    (step) => step.required !== false
  );
  const checklistCompleted =
    requiredSteps.length === 0 ||
    requiredSteps.every((step) =>
      value.some((v) => v === step.id || v.startsWith(step.id + '::'))
    );
  if (action.formKind !== 'support_request_script') {
    return checklistCompleted;
  }
  return checklistCompleted && hasTextValue(getGuidedStepScriptText(value));
}

const GUIDED_STEP_TEXT_SEPARATOR = '::';
const SUPPORT_REQUEST_SCRIPT_TEXT_ID = '__support_request_script_text';

function getGuidedStepChecklistIds(
  action: ProgramStepActionStateDto,
  value: string[]
) {
  if (action.formKind !== 'support_request_script') return value;
  const stepIds = new Set((action.steps ?? []).map((step) => step.id));
  return value
    .map((item) => {
      const separatorIndex = item.indexOf(GUIDED_STEP_TEXT_SEPARATOR);
      return separatorIndex > 0 ? item.slice(0, separatorIndex) : item;
    })
    .filter((item) => stepIds.has(item));
}

function getGuidedStepScriptText(value: string[]) {
  const entry = value.find((item) =>
    item.startsWith(SUPPORT_REQUEST_SCRIPT_TEXT_ID + GUIDED_STEP_TEXT_SEPARATOR)
  );
  return entry
    ? entry.slice(
        SUPPORT_REQUEST_SCRIPT_TEXT_ID.length +
          GUIDED_STEP_TEXT_SEPARATOR.length
      )
    : '';
}

function getLegacyGuidedStepTextMap(
  action: ProgramStepActionStateDto,
  value: string[]
) {
  const stepIds = new Set((action.steps ?? []).map((step) => step.id));
  return value.reduce<Record<string, string>>((acc, item) => {
    const separatorIndex = item.indexOf(GUIDED_STEP_TEXT_SEPARATOR);
    if (separatorIndex <= 0) return acc;
    const stepId = item.slice(0, separatorIndex);
    const text = item.slice(separatorIndex + GUIDED_STEP_TEXT_SEPARATOR.length);
    if (stepIds.has(stepId) && text.trim()) {
      acc[stepId] = text;
    }
    return acc;
  }, {});
}

function getLegacyGuidedStepTextDraft(
  action: ProgramStepActionStateDto,
  output: Record<string, unknown>,
  completedStepIds: string[]
) {
  const stepTexts = isPlainRecord(output.stepTexts) ? output.stepTexts : null;
  if (stepTexts) {
    return (action.steps ?? [])
      .map((step) => stepTexts[step.id])
      .filter(
        (text): text is string =>
          typeof text === 'string' && Boolean(text.trim())
      )
      .join(' ');
  }

  const legacyTextMap = getLegacyGuidedStepTextMap(action, completedStepIds);
  return (action.steps ?? [])
    .map((step) => legacyTextMap[step.id])
    .filter(
      (text): text is string => typeof text === 'string' && Boolean(text.trim())
    )
    .join(' ');
}

function getGuidedStepDraftFromOutput(
  action: ProgramStepActionStateDto,
  output: Record<string, unknown>
) {
  const completedStepIds = Array.isArray(output.completedStepIds)
    ? output.completedStepIds.filter(
        (item): item is string => typeof item === 'string'
      )
    : [];

  if (action.formKind !== 'support_request_script') {
    return completedStepIds;
  }

  const checklistIds = getGuidedStepChecklistIds(action, completedStepIds);
  const scriptText =
    typeof output.scriptText === 'string' && output.scriptText.trim()
      ? output.scriptText
      : getLegacyGuidedStepTextDraft(action, output, completedStepIds);

  return scriptText.trim()
    ? [
        ...checklistIds,
        `${SUPPORT_REQUEST_SCRIPT_TEXT_ID}${GUIDED_STEP_TEXT_SEPARATOR}${scriptText}`,
      ]
    : checklistIds;
}

function getGuidedStepCompletedIds(
  action: ProgramStepActionStateDto,
  value: string[]
) {
  if (action.formKind !== 'support_request_script') return value;
  const stepIds = new Set((action.steps ?? []).map((step) => step.id));
  return value.filter((item) => stepIds.has(item));
}

function getWeeklyCheckQuestions(action: ProgramStepActionStateDto) {
  return action.questions?.length
    ? action.questions
    : fallbackWeeklyCheckQuestions;
}

function isWeeklyQuestionComplete(
  question: ProgramWeeklyCheckQuestionDto,
  value: unknown
) {
  if (question.type === 'rating_scale') return isRatingComplete(value);
  if (question.type === 'text') return hasTextValue(value);
  return isChoiceComplete({
    value,
    mode: question.mode,
    minSelected: question.minSelected,
    maxSelected: question.maxSelected,
  });
}

function isWeeklyCheckComplete(
  action: ProgramStepActionStateDto,
  value: Record<string, unknown>
) {
  const requiredQuestions = getWeeklyCheckQuestions(action).filter(
    (question) => question.required !== false
  );
  if (requiredQuestions.length === 0) return true;
  return requiredQuestions.every((question) =>
    isWeeklyQuestionComplete(question, value[question.id])
  );
}

function hydrateCurrentActionDraft() {
  const action = currentAction.value;
  if (!action || !isPlainRecord(action.output)) return;

  if (action.type === 'journal_entry' || action.type === 'thought_dump') {
    textDraft.value =
      typeof action.output.text === 'string' ? action.output.text : '';
    return;
  }

  if (action.type === 'ai_reflection' || action.type === 'micro_reflection') {
    textDraft.value =
      typeof action.output.text === 'string' ? action.output.text : '';
    reflectionChips.value = Array.isArray(action.output.chips)
      ? action.output.chips.filter(
          (item): item is string => typeof item === 'string'
        )
      : [];
    return;
  }

  if (action.type === 'rating_scale') {
    ratingScaleValue.value =
      typeof action.output.value === 'number' ? action.output.value : null;
    return;
  }

  if (action.type === 'next_route_choice') {
    selectedRouteChoice.value =
      typeof action.output.choice === 'string' ? action.output.choice : null;
    return;
  }

  if (action.type === 'structured_form') {
    structuredFormDraft.value = isPlainRecord(action.output.fields)
      ? action.output.fields
      : {};
    return;
  }

  if (action.type === 'guided_steps') {
    if (isAssessmentPromptAction(action)) return;
    guidedStepsDraft.value = getGuidedStepDraftFromOutput(
      action,
      action.output
    );
    return;
  }

  if (action.type === 'weekly_check') {
    weeklyCheckDraft.value = isPlainRecord(action.output.answers)
      ? action.output.answers
      : {};
  }
}

async function startStep() {
  const started = await useAPI<ProgramStepStartResponseDto>(
    `/api/programs/${slug.value}/steps/${step.value}/start`,
    {
      method: 'POST',
      body: { replay: route.query.replay === '1' },
      suppressErrorToast: true,
    }
  );
  response.value = started;
  completionRewardGranted.value = false;
  completedProgram.value = null;
  completedActionIds.value = new Set(
    started.attempt.actions
      .filter(
        (action: ProgramStepActionStateDto) => action.status === 'completed'
      )
      .map((action: ProgramStepActionStateDto) => action.id)
  );

  // Resume на первый незавершённый action (см. retention/retention_long_term_strategy.md).
  // Если все actions завершены — позволяем заново завершить шаг через последний action.
  const firstPendingIndex = started.attempt.actions.findIndex(
    (action: ProgramStepActionStateDto) => action.status !== 'completed'
  );
  const wasInterrupted = firstPendingIndex > 0;
  actionIndex.value =
    firstPendingIndex >= 0
      ? firstPendingIndex
      : Math.max(0, started.attempt.actions.length - 1);

  if (wasInterrupted) {
    showResumeHint.value = true;
    if (resumeHintTimer) clearTimeout(resumeHintTimer);
    // Прячем hint через 6 сек, чтобы не отвлекал во время самого action.
    resumeHintTimer = setTimeout(() => {
      showResumeHint.value = false;
    }, 6_000);
  } else {
    showResumeHint.value = false;
  }

  await restoreRoadmapTimedPracticeRecovery(started);
}

function goBack() {
  void navigateTo(`/programs/${slug.value}/map`);
}

const canGoBack = computed(() => {
  if (isSaving.value) return false;
  if (actionIndex.value > 0) return true;
  // Разрешаем «Назад» с экрана результата assessment prompt даже если это
  // первый action (возврат к intro внутри того же action, не на предыдущий).
  const action = currentAction.value;
  return Boolean(
    action &&
      isAssessmentPromptAction(action) &&
      returnedAssessmentAttemptId.value !== null
  );
});

function goToPreviousAction() {
  showResumeHint.value = false;
  // Если смотрим результат встроенного опросника — возвращаемся к выбору
  // (intro/quiz) внутри того же action, а не на предыдущий action шага.
  const action = currentAction.value;
  if (
    action &&
    isAssessmentPromptAction(action) &&
    returnedAssessmentAttemptId.value !== null
  ) {
    const next = new Map(assessmentCompletedAttemptByActionId.value);
    next.delete(action.id);
    assessmentCompletedAttemptByActionId.value = next;
    return;
  }
  if (actionIndex.value <= 0) return;
  actionIndex.value -= 1;
}

async function skipAssessmentPrompt() {
  const action = currentAction.value;
  if (!action || !isAssessmentPromptAction(action)) return;
  assessmentPromptSkippedActionIds.value = new Set([
    ...assessmentPromptSkippedActionIds.value,
    action.id,
  ]);
  // Сразу переходим к следующему этапу: показывать отдельный экран «опросник
  // пропущен» — лишний шаг для юзера. Флаг skipped уже выставлен, поэтому
  // completeCurrentAction запишет output со skipped=true.
  await completeCurrentAction();
}

function onAssessmentPromptComplete(attemptId: number) {
  const action = currentAction.value;
  if (!action || !isAssessmentPromptAction(action)) return;
  const next = new Map(assessmentCompletedAttemptByActionId.value);
  next.set(action.id, attemptId);
  assessmentCompletedAttemptByActionId.value = next;
  // Если ранее был помечен как пропущенный (юзер передумал) — снимаем флаг.
  if (assessmentPromptSkippedActionIds.value.has(action.id)) {
    const skipped = new Set(assessmentPromptSkippedActionIds.value);
    skipped.delete(action.id);
    assessmentPromptSkippedActionIds.value = skipped;
  }
}

function markCurrentPracticeComplete() {
  const action = currentAction.value;
  if (!action) return;
  completedActionIds.value = new Set([...completedActionIds.value, action.id]);
  clearUnlockTimer();
  unlockRemainingSeconds.value = 0;
  unlockAccumulatedMs.value =
    (currentActionCompletionDelaySeconds.value ?? 0) * 1000;
  unlockStartedAtMs.value = null;
  unlockActionId.value = action.id;
  void persistCurrentActionRecovery({ completed: true });
}

function formatActionTimerLabel(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function clearUnlockTimer() {
  if (!unlockTimer) return;
  clearInterval(unlockTimer);
  unlockTimer = null;
}

function resetCurrentActionUnlock() {
  clearUnlockTimer();
  unlockActionId.value = null;
  unlockAccumulatedMs.value = 0;
  unlockStartedAtMs.value = null;
  unlockRemainingSeconds.value = currentActionCompletionDelaySeconds.value ?? 0;
}

function getUnlockElapsedMs() {
  const runningMs =
    unlockStartedAtMs.value !== null ? Date.now() - unlockStartedAtMs.value : 0;
  return Math.max(0, unlockAccumulatedMs.value + runningMs);
}

function syncCurrentActionUnlock() {
  const action = currentAction.value;
  const delaySeconds = currentActionCompletionDelaySeconds.value;
  if (!action || !delaySeconds || unlockActionId.value !== action.id) {
    resetCurrentActionUnlock();
    return;
  }

  const remainingSeconds = Math.max(
    0,
    delaySeconds - Math.floor(getUnlockElapsedMs() / 1000)
  );
  unlockRemainingSeconds.value = remainingSeconds;

  if (remainingSeconds > 0) return;
  markCurrentPracticeComplete();
}

function ensureUnlockTimer() {
  if (unlockTimer || typeof window === 'undefined') return;
  unlockTimer = window.setInterval(syncCurrentActionUnlock, 500);
}

function startCurrentActionUnlock() {
  const action = currentAction.value;
  const delaySeconds = currentActionCompletionDelaySeconds.value;
  if (!action || !delaySeconds || isCurrentActionCompleted.value) return;

  if (unlockActionId.value !== action.id) {
    resetCurrentActionUnlock();
    unlockActionId.value = action.id;
  }
  if (unlockStartedAtMs.value === null) {
    unlockStartedAtMs.value = Date.now();
  }
  syncCurrentActionUnlock();
  ensureUnlockTimer();
  void persistCurrentActionRecovery();
}

function pauseCurrentActionUnlock() {
  const action = currentAction.value;
  if (!action || unlockActionId.value !== action.id) return;
  if (unlockStartedAtMs.value !== null) {
    unlockAccumulatedMs.value += Date.now() - unlockStartedAtMs.value;
    unlockStartedAtMs.value = null;
  }
  clearUnlockTimer();
  syncCurrentActionUnlock();
  void persistCurrentActionRecovery();
}

function stopCurrentActionUnlock() {
  if (pageIsUnloading) {
    void persistCurrentActionRecovery();
    return;
  }

  const id = getCurrentRoadmapRecoveryId();
  resetCurrentActionUnlock();
  if (id) {
    void removeTimedPracticeRecoveryRecord(id);
  }
}

function getCurrentRoadmapRecoveryId() {
  const attempt = response.value?.attempt;
  const action = currentAction.value;
  if (!attempt || !action || !isTimedPracticeAction(action)) return null;
  return buildRoadmapTimedPracticeRecoveryId({
    attemptId: attempt.id,
    actionId: action.id,
  });
}

function buildCurrentRoadmapRecoveryRecord(options?: {
  completed?: boolean;
}): TimedPracticeRecoveryRecord | null {
  const attempt = response.value?.attempt;
  const action = currentAction.value;
  const delaySeconds = currentActionCompletionDelaySeconds.value;
  if (!attempt || !action || !delaySeconds) return null;
  if (action.status === 'completed') return null;

  const now = Date.now();
  const id = buildRoadmapTimedPracticeRecoveryId({
    attemptId: attempt.id,
    actionId: action.id,
  });
  const record = createTimedPracticeRecoveryRecord(
    {
      id,
      scope: 'roadmap',
      type: action.type,
      requiredSeconds: delaySeconds,
      attemptId: attempt.id,
      actionId: action.id,
      programSlug: slug.value,
      step: step.value,
    },
    now
  );
  record.accumulatedMs = Math.max(0, Math.floor(unlockAccumulatedMs.value));
  record.startedAtMs = unlockStartedAtMs.value;
  record.running = unlockStartedAtMs.value !== null;
  record.updatedAtMs = now;

  if (
    options?.completed ||
    getTimedPracticeElapsedMs(record, now) >= delaySeconds * 1000
  ) {
    return completeTimedPracticeRecoveryRecord(record, now);
  }

  return record;
}

async function persistCurrentActionRecovery(options?: { completed?: boolean }) {
  const record = buildCurrentRoadmapRecoveryRecord(options);
  if (!record) return;
  await upsertTimedPracticeRecoveryRecord(record);
}

async function restoreRoadmapTimedPracticeRecovery(
  started: ProgramStepStartResponseDto
) {
  const records = await getTimedPracticeRecoveryRecords();
  const record = records.find(
    (item) =>
      item.scope === 'roadmap' &&
      item.attemptId === started.attempt.id &&
      typeof item.actionId === 'string'
  );
  if (!record?.actionId) return;

  const restoredActionIndex = started.attempt.actions.findIndex(
    (action) => action.id === record.actionId
  );
  const action = started.attempt.actions[restoredActionIndex] ?? null;
  const delaySeconds = getActionCompletionDelaySeconds(action);
  if (restoredActionIndex < 0 || !action || !delaySeconds) {
    await removeTimedPracticeRecoveryRecord(record.id);
    return;
  }

  if (action.status === 'completed') {
    actionIndex.value = restoredActionIndex;
    if (started.attempt.status === 'completed') {
      await removeTimedPracticeRecoveryRecord(record.id);
      return;
    }

    if (!areRequiredActionsCompleted(started.attempt.actions)) {
      await removeTimedPracticeRecoveryRecord(record.id);
      return;
    }

    isSaving.value = true;
    try {
      await completeStepAttempt();
      await removeTimedPracticeRecoveryRecord(record.id);
    } catch (error) {
      console.error(
        '[ProgramStep] Не удалось завершить шаг после восстановления timed-практики:',
        error
      );
    } finally {
      isSaving.value = false;
    }
    return;
  }

  const now = Date.now();
  const elapsedMs = Math.min(
    getTimedPracticeElapsedMs(record, now),
    delaySeconds * 1000
  );
  actionIndex.value = restoredActionIndex;
  unlockActionId.value = action.id;
  unlockAccumulatedMs.value = elapsedMs;
  unlockStartedAtMs.value = null;
  unlockRemainingSeconds.value = Math.max(
    0,
    delaySeconds - Math.floor(elapsedMs / 1000)
  );

  const normalizedRecord: TimedPracticeRecoveryRecord = {
    ...record,
    type: action.type,
    requiredSeconds: delaySeconds,
    accumulatedMs: elapsedMs,
    startedAtMs: null,
    running: false,
    updatedAtMs: now,
  };

  if (!hasTimedPracticeReachedRequiredTime(normalizedRecord, now)) {
    await upsertTimedPracticeRecoveryRecord(normalizedRecord);
    showResumeHint.value = true;
    return;
  }

  completedActionIds.value = new Set([...completedActionIds.value, action.id]);
  unlockRemainingSeconds.value = 0;
  await upsertTimedPracticeRecoveryRecord(
    completeTimedPracticeRecoveryRecord(normalizedRecord, now)
  );
  await completeCurrentAction();
}

function areRequiredActionsCompleted(actions: ProgramStepActionStateDto[]) {
  return actions.every(
    (action) =>
      action.required === false ||
      action.status === 'completed' ||
      completedActionIds.value.has(action.id)
  );
}

function formatLocalDateToIso(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

async function completeStepAttempt() {
  if (!response.value) return false;

  const completed = await useAPI<ProgramStepCompleteResponseDto>(
    `/api/program-step-attempts/${response.value.attempt.id}/complete`,
    {
      method: 'POST',
      suppressErrorToast: true,
    }
  );
  completionRewardGranted.value = completed.rewardGranted;
  completedProgram.value = completed.program;
  trialUpsellPrompt.value = completed.trialUpsell ?? null;
  response.value = {
    ...response.value,
    attempt: completed.attempt,
  };
  isCompleted.value = true;
  return true;
}

async function completeCurrentAction() {
  if (!response.value || !currentAction.value || nextDisabled.value) return;
  isSaving.value = true;
  const currentRecoveryId = getCurrentRoadmapRecoveryId();

  try {
    let output: unknown = null;

    if (currentAction.value.type === 'mood_checkin' && selectedMood.value) {
      await useAPI('/api/mood/checkin', {
        method: 'POST',
        body: { mood: selectedMood.value, source: 'program_step' },
        suppressErrorToast: true,
      });
      output = { mood: selectedMood.value };
    } else if (
      currentAction.value.type === 'breathing' ||
      currentAction.value.type === 'quick_help_breathing' ||
      currentAction.value.type === 'quick_help_grounding' ||
      currentAction.value.type === 'quick_help_tension'
    ) {
      output = {
        type: currentAction.value.type,
        template: currentAction.value.template || null,
        completedAt: new Date().toISOString(),
      };
    } else if (currentAction.value.type === 'journal_entry') {
      const trimmedText = textDraft.value.trim();
      if (trimmedText) {
        const diaryResponse = await useAPI<{ item: { id: number } }>(
          '/api/gratitude-diary/entries',
          {
            method: 'POST',
            body: {
              text: trimmedText,
              mood: null,
              tags: [],
              entryDate: formatLocalDateToIso(new Date()),
              photoUrl: null,
              photoStorageKey: null,
              inputMethod: textInputMethod.value,
              promptText: currentAction.value.prompt || null,
            },
            suppressErrorToast: true,
          }
        );
        output = {
          text: trimmedText,
          diaryEntryId: diaryResponse.item.id,
          inputMethod: textInputMethod.value,
        };
      } else {
        output = { skipped: true };
      }
    } else if (
      currentAction.value.type === 'ai_reflection' ||
      currentAction.value.type === 'micro_reflection'
    ) {
      const trimmedText = textDraft.value.trim();
      output =
        trimmedText || reflectionChips.value.length
          ? {
              text: trimmedText || null,
              chips: reflectionChips.value,
              inputMethod: textInputMethod.value,
            }
          : { skipped: true };
    } else if (currentAction.value.type === 'rating_scale') {
      output =
        ratingScaleValue.value !== null
          ? {
              value: ratingScaleValue.value,
              scaleMin: currentAction.value.scaleMin ?? 0,
              scaleMax: currentAction.value.scaleMax ?? 10,
              label:
                currentAction.value.scaleBeforeLabel ||
                currentAction.value.scaleAfterLabel ||
                currentAction.value.prompt ||
                null,
            }
          : { skipped: true };
    } else if (currentAction.value.type === 'next_route_choice') {
      output = selectedRouteChoice.value
        ? { choice: selectedRouteChoice.value }
        : { skipped: true };
    } else if (currentAction.value.type === 'thought_dump') {
      const trimmedText = textDraft.value.trim();
      output = trimmedText
        ? {
            text: trimmedText,
            inputMethod: textInputMethod.value,
          }
        : { skipped: true };
    } else if (currentAction.value.type === 'structured_form') {
      output = {
        type: 'structured_form',
        formKind: currentAction.value.formKind || null,
        fields: structuredFormDraft.value,
        completedAt: new Date().toISOString(),
      };
    } else if (currentAction.value.type === 'guided_steps') {
      if (isAssessmentPromptAction(currentAction.value)) {
        output = {
          type: 'guided_steps',
          formKind: 'assessment_prompt',
          assessmentSlug: currentAction.value.targetId || null,
          source:
            currentAction.value.template === 'program_final'
              ? 'program_final'
              : 'program_baseline',
          assessmentAttemptId: returnedAssessmentAttemptId.value,
          skipped:
            !returnedAssessmentAttemptId.value ||
            isCurrentAssessmentPromptSkipped.value,
          completedAt: new Date().toISOString(),
        };
      } else {
        const completedStepIds = getGuidedStepCompletedIds(
          currentAction.value,
          guidedStepsDraft.value
        );
        const scriptText =
          currentAction.value.formKind === 'support_request_script'
            ? getGuidedStepScriptText(guidedStepsDraft.value).trim()
            : null;
        output = {
          type: 'guided_steps',
          formKind: currentAction.value.formKind || null,
          completedStepIds,
          ...(scriptText ? { scriptText } : {}),
          completedAt: new Date().toISOString(),
        };
      }
    } else if (currentAction.value.type === 'weekly_check') {
      output = {
        type: 'weekly_check',
        placement: currentAction.value.placement || null,
        answers: weeklyCheckDraft.value,
        completedAt: new Date().toISOString(),
      };
    } else if (currentAction.value.type === 'meditation') {
      output = isCurrentActionCompleted.value
        ? {
            targetId: currentAction.value.targetId || null,
            template: currentAction.value.template || null,
            completedAt: new Date().toISOString(),
          }
        : { skipped: true };
    } else if (currentAction.value.type === 'ai_chat_session') {
      // Закрываем billing-сессию чата с reason='roadmap_next'.
      // Сервер строит session-summary, если eligibility выполнена.
      // Сам PATCH action.status='completed' идёт ниже общим путём.
      const finalizeResult =
        await aiChatActionRef.value?.finalizeForRoadmapNext();
      output = {
        type: 'ai_chat_session',
        eligible: finalizeResult?.eligible === true,
        triggered: finalizeResult?.triggered === true,
        completedAt: new Date().toISOString(),
      };
    } else if (isUnknownAction.value) {
      // Неизвестный action-тип — выставляем skipped, чтобы фронт не залип.
      // Серверный completeProgramStep увидит status='completed' и пропустит.
      output = { skipped: true, fallback: true };
    }

    let patched = await useAPI<{
      attempt: ProgramStepStartResponseDto['attempt'];
    }>(
      `/api/program-step-attempts/${response.value.attempt.id}/actions/${currentAction.value.id}`,
      {
        method: 'PATCH',
        body: { status: 'completed', output },
        suppressErrorToast: true,
      }
    );

    response.value = {
      ...response.value,
      attempt: patched.attempt,
    };

    const shouldCompleteAttempt =
      actionIndex.value >= response.value.attempt.actions.length - 1;
    if (currentRecoveryId && !shouldCompleteAttempt) {
      await removeTimedPracticeRecoveryRecord(currentRecoveryId);
    }

    if (shouldCompleteAttempt) {
      const completed = await completeStepAttempt();
      if (completed && currentRecoveryId) {
        await removeTimedPracticeRecoveryRecord(currentRecoveryId);
      }
      return;
    }

    actionIndex.value += 1;
  } catch (error) {
    console.error('[ProgramStep] Не удалось сохранить действие шага:', error);
  } finally {
    isSaving.value = false;
  }
}

function persistRecoveryOnLifecyclePause() {
  void persistCurrentActionRecovery();
}

function handleRecoveryVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    persistRecoveryOnLifecyclePause();
    return;
  }

  pageIsUnloading = false;
  syncCurrentActionUnlock();
}

function handleRecoveryPageHide() {
  pageIsUnloading = true;
  persistRecoveryOnLifecyclePause();
}

function handleRecoveryBeforeUnload() {
  pageIsUnloading = true;
  persistRecoveryOnLifecyclePause();
}

function bindTimedPracticeRecoveryLifecycle() {
  if (typeof document !== 'undefined') {
    document.addEventListener(
      'visibilitychange',
      handleRecoveryVisibilityChange
    );
    removeRecoveryVisibilityListener = () => {
      document.removeEventListener(
        'visibilitychange',
        handleRecoveryVisibilityChange
      );
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', handleRecoveryPageHide);
    removeRecoveryPagehideListener = () => {
      window.removeEventListener('pagehide', handleRecoveryPageHide);
    };
    window.addEventListener('beforeunload', handleRecoveryBeforeUnload);
    removeRecoveryBeforeUnloadListener = () => {
      window.removeEventListener('beforeunload', handleRecoveryBeforeUnload);
    };
  }

  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (isActive) {
            pageIsUnloading = false;
            syncCurrentActionUnlock();
            return;
          }

          persistRecoveryOnLifecyclePause();
        }
      );
      removeRecoveryAppStateListener = () => listener.remove();
    } catch {
      // Web закрыт visibility/pagehide; Capacitor может быть недоступен.
    }
  })();
}

function cleanupTimedPracticeRecoveryLifecycle() {
  removeRecoveryVisibilityListener?.();
  removeRecoveryVisibilityListener = null;
  removeRecoveryPagehideListener?.();
  removeRecoveryPagehideListener = null;
  removeRecoveryBeforeUnloadListener?.();
  removeRecoveryBeforeUnloadListener = null;
  if (removeRecoveryAppStateListener) {
    void removeRecoveryAppStateListener();
    removeRecoveryAppStateListener = null;
  }
}

watch(actionIndex, () => {
  selectedMood.value = null;
  textDraft.value = '';
  textInputMethod.value = 'text';
  reflectionChips.value = [];
  ratingScaleValue.value = null;
  selectedRouteChoice.value = null;
  structuredFormDraft.value = {};
  guidedStepsDraft.value = [];
  weeklyCheckDraft.value = {};
  // Любое переключение action скрывает resume-hint — пользователь уже
  // сориентировался, дальше hint бы только отвлекал.
  showResumeHint.value = false;
});

watch(
  () => currentAction.value?.id ?? null,
  () => {
    resetCurrentActionUnlock();
    hydrateCurrentActionDraft();
  },
  { immediate: true }
);

watch(isCompleted, (completed) => {
  if (!completed || confettiLaunched.value) return;
  confettiLaunched.value = true;
  void launchStepCompletionConfetti({ intensity: 'soft' });
});

// Триггер finale-flow: как только пользователь завершил весь Сад,
// автоматически открываем preparing-overlay для polling'а итогового отчёта.
// Watch'имся на isProgramJustCompleted, чтобы не запустить дважды и чтобы
// отреагировать когда completedProgram уже подгружен (он приходит из ответа
// /complete endpoint'а, а не сразу при isCompleted=true).
watch(isProgramJustCompleted, (isFinal) => {
  if (isFinal && !preparingOpen.value && !reportSheetOpen.value) {
    // Запускаем генерацию итогового отчёта в фоне сразу, но оверлей анализа
    // НЕ показываем — сперва должна доиграть анимация цветка (flyout) на
    // success-экране. Оверлей/отчёт откроются в onPlantFlyoutComplete.
    finalFlyoutDone.value = false;
    finalPreparingMinElapsed.value = false;
    finaleIsReplayRefresh.value = false;
    preparingVisible.value = false;
    preparingOpen.value = true;
  }
});

// Триггер пересборки отчёта при replay последнего шага. Цветка на replay нет,
// поэтому оверлей анализа показываем сразу (flyout/min-elapsed помечаем
// завершёнными), а сам отчёт форсим через force-refresh в preparing-компоненте.
watch(isFinalStepReplayJustCompleted, (isReplayFinal) => {
  if (isReplayFinal && !preparingOpen.value && !reportSheetOpen.value) {
    finaleIsReplayRefresh.value = true;
    finalFlyoutDone.value = true;
    finalPreparingMinElapsed.value = true;
    preparingVisible.value = true;
    preparingOpen.value = true;
  }
});

// Триггер промежуточного чекпоинт-отчёта: если шаг 7/14/21 и в actions
// был weekly_check action. Не срабатывает на шаге 30 (там финальный flow).
watch(isCompleted, (completed) => {
  if (!completed) return;
  if (isProgramJustCompleted.value) return; // финал обрабатывается отдельно
  if (
    checkpointPreparingOpen.value ||
    checkpointSheetOpen.value ||
    checkpointData.value
  ) {
    return;
  }
  const stepNumber = response.value?.step?.step;
  if (!stepNumber) return;
  // Если чекпоинт-шаг совпадает с последним шагом программы (например, шаг 21
  // в 21-шаговом саду), промежуточный отчёт за отрезок дублировал бы итоговый.
  // В этом случае генерируем только итоговый (финальный flow) и не запускаем
  // отдельную недельную сводку. Это надёжнее, чем полагаться только на
  // isProgramJustCompleted, который зависит от асинхронной выдачи награды.
  const totalSteps = response.value?.program?.totalSteps ?? 0;
  if (totalSteps > 0 && stepNumber >= totalSteps) return;
  const isCheckpointStep =
    stepNumber === 7 || stepNumber === 14 || stepNumber === 21;
  if (!isCheckpointStep) return;
  const hasWeeklyCheckAction = response.value?.attempt?.actions?.some(
    (a) => a.type === 'weekly_check' && a.status === 'completed'
  );
  if (!hasWeeklyCheckAction) return;
  // Генерация чекпоинт-отчёта стартует в фоне; оверлей покажем после анимации
  // цветка на success-экране (см. onPlantFlyoutComplete).
  checkpointStep.value = stepNumber as 7 | 14 | 21;
  checkpointFlyoutDone.value = false;
  checkpointPreparingVisible.value = false;
  checkpointPreparingOpen.value = true;
});

// Хендлеры flow'а финального отчёта:
//  - onReportReady: polling вернул 'ready' → сохраняем payload, закрываем
//    preparing, открываем report sheet.
//  - onPreparingFailed: timeout 60 сек ИЛИ system error → закрываем preparing
//    и уходим на /garden (там пользователь увидит отчёт, когда backend
//    дозакончит).
//  - onPreparingLeave: пользователь сам нажал «Уйти в Оранжерею» через
//    long-wait CTA после 15+ сек.
//  - onReportSheetOpenChange: при закрытии sheet'а уходим на /garden.
function onReportReady(payload: ReportReadyPayload) {
  // Отчёт готов, но открываем его только после завершения анимации цветка.
  reportData.value = payload;
  maybeRevealFinalReport();
}

function clearFinalPreparingTimer() {
  if (finalPreparingMinTimer) {
    clearTimeout(finalPreparingMinTimer);
    finalPreparingMinTimer = null;
  }
}

function onPreparingFailed() {
  clearFinalPreparingTimer();
  preparingOpen.value = false;
  preparingVisible.value = false;
  finalFlyoutDone.value = false;
  finaleIsReplayRefresh.value = false;
  void navigateTo('/garden');
}

function onPreparingLeave() {
  clearFinalPreparingTimer();
  preparingOpen.value = false;
  preparingVisible.value = false;
  finalFlyoutDone.value = false;
  finaleIsReplayRefresh.value = false;
  void navigateTo('/garden');
}

// Единый обработчик завершения анимации цветка (flyout). Вызывается и для
// чекпоинтов, и для финала — ветвимся по isProgramJustCompleted. На обычных
// (не отчётных) шагах оба maybeReveal* делают ранний выход.
function onPlantFlyoutComplete() {
  if (isProgramJustCompleted.value) {
    finalFlyoutDone.value = true;
    // Цветок доиграл — показываем фазу анализа данных и держим её минимум
    // FINAL_PREPARING_MIN_MS, чтобы юзер увидел формирование отчёта, даже если
    // данные уже готовы. Только после этого открываем сам отчёт.
    if (preparingOpen.value) {
      preparingVisible.value = true;
      if (!finalPreparingMinTimer) {
        finalPreparingMinTimer = setTimeout(() => {
          finalPreparingMinTimer = null;
          finalPreparingMinElapsed.value = true;
          maybeRevealFinalReport();
        }, FINAL_PREPARING_MIN_MS);
      }
    }
    maybeRevealFinalReport();
  } else {
    checkpointFlyoutDone.value = true;
    maybeRevealCheckpointReport();
  }
}

// Показываем итог только когда: анимация цветка доиграла, прошёл минимальный
// показ фазы анализа И отчёт готов. Пока чего-то из этого нет — держим оверлей
// «Готовится отчёт» видимым.
function maybeRevealFinalReport() {
  if (!preparingOpen.value) return; // финальный flow не активен
  if (!finalFlyoutDone.value) return;
  if (reportData.value && finalPreparingMinElapsed.value) {
    preparingOpen.value = false;
    preparingVisible.value = false;
    reportSheetOpen.value = true;
  } else {
    preparingVisible.value = true;
  }
}

function maybeRevealCheckpointReport() {
  if (!checkpointPreparingOpen.value) return; // чекпоинт-flow не активен
  if (!checkpointFlyoutDone.value) return;
  if (checkpointData.value) {
    checkpointPreparingOpen.value = false;
    checkpointPreparingVisible.value = false;
    checkpointSheetOpen.value = true;
  } else {
    checkpointPreparingVisible.value = true;
  }
}

// Handlers промежуточного чекпоинт-отчёта.
// onCheckpointReady: preparing завершён, открываем sheet и сразу помечаем
// отчёт как просмотренный (юзер видит его прямо сейчас на этом экране).
// onCheckpointFailed/Skip: закрываем preparing, юзер видит обычный success-экран
// шага (отчёт всё равно сохранён в БД, доступен из /garden).
function onCheckpointReady(payload: {
  reportId: number | null;
  summaryText: string;
  structuredData: CheckpointStructuredDataDto;
}) {
  checkpointData.value = {
    summaryText: payload.summaryText,
    structuredData: payload.structuredData,
  };
  // Открываем sheet только после завершения анимации цветка (см. maybeReveal).
  maybeRevealCheckpointReport();
  // Mark-viewed: юзер увидит sheet, не показываем in-app модалку
  // и не шлём push для этого отчёта.
  if (payload.reportId) {
    void useAPI(`/api/garden/reports/${payload.reportId}/mark-viewed`, {
      method: 'POST',
      suppressErrorToast: true,
    });
  }
}

function onCheckpointFailed() {
  checkpointPreparingOpen.value = false;
  checkpointPreparingVisible.value = false;
  checkpointFlyoutDone.value = false;
}

function onCheckpointSkip() {
  checkpointPreparingOpen.value = false;
  checkpointPreparingVisible.value = false;
  checkpointFlyoutDone.value = false;
}

function onCheckpointSheetOpenChange(value: boolean) {
  checkpointSheetOpen.value = value;
  if (!value) {
    // После закрытия — сбрасываем data, чтобы при следующем чекпоинте watch не
    // отбросил триггер (он проверяет !checkpointData.value).
    checkpointData.value = null;
    checkpointStep.value = null;
    checkpointPreparingVisible.value = false;
    checkpointFlyoutDone.value = false;
  }
}

// Перехватывает уход с success-экрана: если бэк прислал промо-paywall —
// показываем модалку, а реальную навигацию откладываем до решения пользователя.
function runSuccessNavigation(navigate: () => void) {
  const prompt = trialUpsellPrompt.value;
  if (prompt?.show && !showTrialUpsellModal.value) {
    // Показываем один раз за success-экран и сразу фиксируем точку на бэке,
    // чтобы она не повторилась, даже если пользователь закроет приложение.
    trialUpsellPrompt.value = null;
    trialUpsellMilestone.value = prompt.milestone;
    upsellPendingNavigate.value = navigate;
    upsellResolved = false;
    showTrialUpsellModal.value = true;
    void trialUpsell.markShown(prompt.milestone);
    trialUpsell.trackShown(prompt.milestone);
    return;
  }
  navigate();
}

function handleTrialUpsellConfirm() {
  if (upsellResolved) return;
  upsellResolved = true;
  showTrialUpsellModal.value = false;
  // Пользователь идёт оформлять подписку — отложенную навигацию отменяем.
  upsellPendingNavigate.value = null;
  trialUpsell.trackCta(trialUpsellMilestone.value);
  void navigateTo({ path: '/subscription', query: { plan: 'pro' } });
}

function handleTrialUpsellDismiss() {
  if (upsellResolved) return;
  upsellResolved = true;
  showTrialUpsellModal.value = false;
  trialUpsell.trackDismissed(trialUpsellMilestone.value);
  const navigate = upsellPendingNavigate.value;
  upsellPendingNavigate.value = null;
  navigate?.();
}

function goToNextStep() {
  const next = nextStepNumber.value;
  if (!next) return;
  runSuccessNavigation(() => {
    // Новый шаг (не replay) учитывается в дневном лимите. Если он достигнут —
    // открываем DailyLimitInfoDialog (тот же UX, что в map.vue / HomeRoadmapCard),
    // вместо ловли 409 E_DAILY_LIMIT на сервере.
    void dailyLimit.refreshIfExpired().catch(() => undefined);
    if (!nextStepIsReplay.value && dailyLimit.isReachedNow()) {
      dailyLimitDialogOpen.value = true;
      return;
    }
    void navigateTo({
      path: `/programs/${slug.value}/steps/${next}`,
      query: nextStepIsReplay.value ? { replay: '1' } : undefined,
    });
  });
}

function goToHomeFromSuccess() {
  runSuccessNavigation(() => {
    void navigateTo('/');
  });
}

function onReportSheetOpenChange(value: boolean) {
  reportSheetOpen.value = value;
  if (!value) {
    // Закрытие sheet'а в финальном flow → переход в Оранжерею, где
    // пользователь видит свой новый сад в коллекции.
    void navigateTo('/garden');
  }
}

onBeforeUnmount(() => {
  clearFinalPreparingTimer();
  if (resumeHintTimer) {
    clearTimeout(resumeHintTimer);
    resumeHintTimer = null;
  }
  if (pageIsUnloading || isCurrentActionCompleted.value) {
    persistRecoveryOnLifecyclePause();
  } else {
    const id = getCurrentRoadmapRecoveryId();
    if (id) {
      void removeTimedPracticeRecoveryRecord(id);
    }
  }
  cleanupTimedPracticeRecoveryLifecycle();
  clearUnlockTimer();
  // Снимаем приглушение фоновой сцены при уходе со страницы шага. Сам lock
  // авто-освобождается через onScopeDispose внутри useSceneAudioFocus, но флаг
  // нужен, чтобы отпустить ещё не дорезолвившийся acquire (см. watch выше).
  sceneDuckingDisposed = true;
  const pendingSceneLock = sceneDuckingLock.value;
  sceneDuckingLock.value = null;
  void pendingSceneLock?.release();
});

onMounted(() => {
  bindTimedPracticeRecoveryLifecycle();
  // Параллельно подгружаем daily-лимит — он нужен success-экрану для CTA
  // «Следующий шаг». Если не подтянули — fallback на навигацию: backend всё
  // равно вернёт 409 E_DAILY_LIMIT при старте, и сюда возвращаемся на /.
  void dailyLimit.load().catch(() => {
    /* fallback — реальная проверка лимита на стороне сервера */
  });
  void startStep().catch((error) => {
    console.error('[ProgramStep] Не удалось начать шаг:', error);
    // Daily limit (2 шага/день) — backend кидает HTTP 409 с code='E_DAILY_LIMIT'.
    // Возвращаемся на главную, чтобы пользователь увидел счётчик до полуночи
    // в HomeRoadmapCard (см. retention/retention_long_term_strategy.md).
    const code = (error as { data?: { error?: { code?: string } } })?.data
      ?.error?.code;
    if (code === 'E_DAILY_LIMIT') {
      // Race-condition fallback: prevention в HomeRoadmapCard и map.vue должны
      // ловить 99% случаев и показывать DailyLimitInfoDialog. Сюда попадаем
      // только если пользователь зашёл по deeplink/refresh URL и попытался
      // стартовать новый шаг при уже достигнутом лимите.
      useToast(
        'На сегодня шаги закончились',
        'Завтра откроется следующий. А пока доступны практики и ассистент.',
        'info'
      );
      void navigateTo('/');
      return;
    }
    void navigateTo(`/programs/${slug.value}/map`);
  });
});
</script>

<style scoped>
.resume-hint-enter-active,
.resume-hint-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}
.resume-hint-enter-from,
.resume-hint-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
