<template>
  <div class="relative space-y-3 h-full">
    <!-- Блок «Тема разговора» убран: его контент теперь приходит как первое
         сообщение ассистента в чате (см. в setup → seedIntroMessage). Это
         даёт больше места для самих сообщений на маленьких экранах и читается
         как естественное начало разговора, а не как «технический заголовок». -->

    <!-- Bounding-box для ChatRoom. Ограничиваем maxHeight через 100dvh, чтобы
         композер чата (живёт в bottom: 0 wrapper'a в embedded mode) НЕ уходил
         в зону fixed-кнопки «Назад / Дальше» step runner'а
         (section.fixed.bottom-[100px] высотой ~48px) и BottomNav (~100px).
         100dvh − 280px = PageHeader (~50) + ProgramStepHeader (~90) + mt (~10)
         + fixed-кнопка (~48) + BottomNav (~100) + зазор ~20px. Mini-header
         и topic-блок убраны — поэтому верхней области меньше, и чат теперь
         получает больше высоты, чем раньше. -->
    <div
      class="relative w-full"
      :style="{
        height: 'inherit',
        minHeight: '200px',
        maxHeight: 'calc(100dvh - 280px)',
      }"
    >
      <!-- v-if гард: ChatRoom монтируется ТОЛЬКО после того как async-prep
           (закрытие предыдущей сессии + auto-саммари + clearMessages) завершён.
           Иначе child onMounted сработает до родителя и подхватит грязный store.
           См. лог-комментарий в setup ниже. -->
      <ChatRoom
        v-if="isPrepared"
        ref="chatRoomRef"
        mode="embedded"
        :topic-prompt="action.topicPrompt"
        :goal-hint="action.goalHint"
        :min-qualifying-messages="action.minQualifyingMessages"
        :min-duration-sec="action.minDurationSec"
        @done="onChatRoomDone"
      />
      <div
        v-else
        class="glass-deep flex h-full items-center justify-center"
        aria-busy="true"
      >
        <div class="text-center">
          <div
            class="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70"
            aria-hidden="true"
          />
          <p class="text-xs text-foreground/55">Готовлю разговор…</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, onScopeDispose, ref } from 'vue';
import { useRoute } from 'vue-router';
import ChatRoom from '@/app/components/chat/ChatRoom.vue';
import type {
  ChatEligibilityProgress,
  ChatSessionFinalizeResult,
} from '@/app/composables/useChatSession';
import { useChatStore } from '@/app/stores/chat';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

/**
 * Embedded AI-чат как тип action внутри Roadmap-шага
 * (см. retention/retention_long_term_strategy.md).
 *
 * Под капотом — обычный `<ChatRoom>`, но:
 *  - sticky-кнопка «Подвести итог» скрыта;
 *  - прогресс-индикатор eligibility всегда видим (не dev-only);
 *  - родитель (step runner) через ref может прочитать `isEligible`
 *    и вызвать `finalize()` по нажатию «Дальше».
 *
 * Принципиальный инвариант: useChatSession внутри ChatRoom создаётся с
 * `skipDisposeFinalize=true`, а финализация идёт из этой обёртки: явно по
 * кнопке «Дальше» и defensive при уходе со страницы.
 */

const props = defineProps<{
  action: ProgramStepActionStateDto;
}>();
const emit = defineEmits<{ (e: 'complete'): void }>();

// КРИТИЧНО: Vue 3.5+ auto-unwrap'ает refs внутри `defineExpose` при доступе
// через template ref. `chatRoomRef.value.isEligible` — это уже развёрнутый
// boolean, обращение к `.value` после возвращает undefined. Из-за этого
// до сессии 19 кнопка «Дальше» в Roadmap была disabled навсегда независимо
// от eligibility (баг проявлялся только на embedded-ChatRoom, потому что
// в page-режиме `/chat` ref на ChatRoom не используется). Тип отражает
// форму ПОСЛЕ auto-unwrap'а — без `.value`.
type ChatRoomInstance = {
  isEligible: boolean;
  eligibilityProgress: ChatEligibilityProgress | null;
  finalize: (params: {
    reason: 'roadmap_next' | 'manual_summary' | 'unmount';
  }) => Promise<ChatSessionFinalizeResult>;
};

const chatRoomRef = ref<ChatRoomInstance | null>(null);

// Roadmap entry-context для chat-store. Сервер использует его для построения
// system prompt'а LLM-провайдера (см. server/application/chat/roadmap-entry.service.ts):
// ассистент удерживает тему конкретного шага, понимает цель разговора, не
// приветствует первым (первое сообщение всегда от пользователя).
const route = useRoute();
const chat = useChatStore();
const previousEntryContext = ref<typeof chat.entryContext>(null);
const pendingRoadmapFinalize =
  ref<Promise<ChatSessionFinalizeResult | null> | null>(null);
const hasRequestedRoadmapFinalize = ref(false);

// Гард: ChatRoom монтируем только после async-prep'а (закрытие предыдущей
// сессии + автосаммари + чистка store). Это устраняет три race-condition'а:
//  1. _hardClearChatClient внутри endSessionAndSummarize асинхронно зануляет
//     наш только-что-выставленный entryContext / sessionId.
//  2. ChatRoom.onMounted (срабатывает РАНЬШЕ родительского onMounted, если
//     ChatRoom отрендерен сразу) мог тянуть restoreActiveSessionFromServer
//     до того как мы закроем прошлую therapy_session — старые сообщения
//     «приезжали» обратно. В embedded режиме restore теперь skip'нут
//     (см. ChatRoom.vue onMounted), но дополнительная защита через v-if
//     не помешает.
//  3. Саммари прошлой сессии fire-and-forget мог не успеть до того, как
//     пользователь нажмёт «Дальше» в новом ai_chat шаге.
const isPrepared = ref(false);

onMounted(async () => {
  // Если это не ai_chat (нет topicPrompt — невалидный action?), пропускаем prep:
  // в шаблоне ChatRoom всё равно отрендерится без topic context'а.
  if (!props.action.topicPrompt) {
    isPrepared.value = true;
    return;
  }

  // ШАГ 1. Если в store остались сообщения / активная therapy_session —
  // это значит, что предыдущая Roadmap-сессия (другой ai_chat шаг или
  // глобальный чат) не была закрыта корректно. Закрываем её ЯВНО и
  // ДОЖИДАЕМСЯ ответа: серверу нужно записать session_summary, чтобы
  // оно появилось на странице истории сессий. Без await саммари могло
  // не успевать (особенно при быстром перелистывании шагов).
  //
  // ВНИМАНИЕ: trigger='manual' (а не 'app-hidden'). App мы НЕ скрываем —
  // отправляем обычный POST. По reason передаём флаг через прямой
  // вызов store-action'а (eligibilityOverride здесь не нужен: глобальный
  // isEligibleForSummary будет применён к прошлой сессии — если её
  // длительность/сообщения проходят глобальные пороги, summary создастся;
  // если нет, серверу нечего синтезировать, и это OK).
  if (chat.messages.length > 0 || chat.therapySessionId) {
    try {
      await chat.endSessionAndSummarize({ trigger: 'manual' });
    } catch (error) {
      // Лог + продолжаем: clean store важнее backend'ской саммари (её
      // подхватит retry-инфра session-finish.client.ts при следующем
      // visibility-change'е, если что).
      console.error(
        '[ProgramAiChatAction] Failed to finalize previous session before Roadmap ai_chat:',
        error
      );
    }
    // _hardClearChatClient внутри endSessionAndSummarize обнулил sessionId
    // и messages, но на всякий случай дёргаем clearMessages — на случай
    // если endSessionAndSummarize выкинул early-return (isFinalizingSession).
    chat.clearMessages();
    chat.resetTherapySessionState();
  }

  // ШАГ 2. Стартуем НОВУЮ client-side сессию для этого ai_chat шага.
  chat.startSession();

  // ШАГ 3. Выставляем entryContext конкретного шага. Сервер инжектит его
  // в developer prompt LLM (см. roadmap-entry.service.ts) — каждый шаг
  // получает свою тему / цель.
  previousEntryContext.value = chat.entryContext;
  const slug = String(route.params.slug || '').trim() || 'unknown';
  const stepNum = Number(route.params.step) || 0;
  chat.entryContext = {
    type: 'roadmap_step',
    program_slug: slug,
    step_number: stepNum > 0 ? stepNum : 1,
    step_title: props.action.title || 'AI-чат шага',
    topic_prompt: props.action.topicPrompt,
    goal_hint: props.action.goalHint,
  };

  // ШАГ 4. Сидируем первое сообщение от ассистента с темой разговора. Раньше
  // тема жила в отдельном блоке «Тема разговора» над чатом — забирала место
  // на маленьких экранах. Теперь это естественный assistant-bubble: юзер
  // сразу видит, о чём пойдёт разговор, и отвечает как в обычной переписке.
  // transient=true: сообщение не уходит на бэк, сервер всё равно знает
  // контекст через entryContext.
  seedIntroMessage();

  // ШАГ 5. Разрешаем рендер ChatRoom. Теперь его onMounted увидит чистый
  // store с правильным entryContext и не подтянет старые сообщения.
  isPrepared.value = true;
});

function buildIntroText(): string {
  const topic = props.action.topicPrompt?.trim();
  if (!topic) return 'С чего начнём?';
  return `${topic}\n\nС чего начнём?`;
}

function seedIntroMessage(): void {
  // Защита от дубля: если по какой-то причине в сторе уже есть сообщения
  // (например, race-condition при resume) — не добавляем повторно.
  if (chat.messages.length > 0) return;
  chat.addRuntimeMessage({
    role: 'assistant',
    content: buildIntroText(),
    transient: true,
    source: 'chat',
    feedbackDisabled: true,
  });
}

// Cleanup в двух местах для максимальной надёжности:
//  1. onBeforeUnmount — стандартный Vue-хук, работает при обычном размонтировании.
//  2. onScopeDispose — низкоуровневый hook effect scope, гарантированно
//     вызывается даже если parent уничтожен «жёстко» (например, через
//     hot-reload, программную замену layout или error boundary). Если Vue
//     hook не сработал — этот всё равно вернёт контекст в исходное состояние.
//
// Обёрнуто в try/finally: даже если finalize упадёт (network error, server
// 500), entryContext всё равно восстановится. Без этого roadmap-промпт мог
// «прилипнуть» к глобальному чату при следующем открытии /chat.
let hasRestoredEntryContext = false;
function restoreEntryContextSafely(): void {
  if (hasRestoredEntryContext) return;
  hasRestoredEntryContext = true;
  try {
    chat.entryContext = previousEntryContext.value;
  } catch (error) {
    console.error(
      '[ProgramAiChatAction] Failed to restore entryContext on cleanup:',
      error
    );
  }
}

onBeforeUnmount(() => {
  try {
    if (!hasRequestedRoadmapFinalize.value && hasChatContentForSummary()) {
      void finalizeForRoadmapNext().catch((error) => {
        console.error(
          '[ProgramAiChatAction] Failed to finalize Roadmap ai_chat on unmount:',
          error
        );
      });
    }
  } finally {
    restoreEntryContextSafely();
  }
});

onScopeDispose(() => {
  // Fallback на случай, если onBeforeUnmount не сработал (например,
  // компонент уничтожен через hot-reload или error boundary). Идемпотентно
  // через флаг hasRestoredEntryContext.
  restoreEntryContextSafely();
});

// БЕЗ `.value` — поля уже auto-unwrap'нуты Vue (см. комментарий на типе).
const isEligible = computed(() => chatRoomRef.value?.isEligible ?? false);
const eligibilityProgress = computed(
  () => chatRoomRef.value?.eligibilityProgress ?? null
);

function onChatRoomDone() {
  // ChatRoom финализировался по кнопке "Подвести итог" внутри (page-mode logic).
  // В embedded режиме мы её скрыли, поэтому этот путь маловероятен; на всякий случай
  // эмитим complete родителю, чтобы прогресс шагов не повис.
  emit('complete');
}

function hasChatContentForSummary(): boolean {
  return chat.messages.some(
    (message) => message.role === 'user' && message.content.trim().length > 0
  );
}

/**
 * Вызывается родителем (step runner) при нажатии CTA «Дальше».
 * Closes billing-сессию с reason='roadmap_next', возвращает результат.
 * Если eligibility ещё не выполнена, finalize-сессия возвращает eligible=false
 * и summary не создаётся — это OK, step runner должен залочить кнопку до выполнения.
 */
async function finalizeForRoadmapNext(): Promise<ChatSessionFinalizeResult | null> {
  if (pendingRoadmapFinalize.value) {
    return pendingRoadmapFinalize.value;
  }

  hasRequestedRoadmapFinalize.value = true;
  pendingRoadmapFinalize.value = (
    chatRoomRef.value
      ? chatRoomRef.value.finalize({ reason: 'roadmap_next' })
      : chat.endSessionAndSummarize({
          trigger: 'roadmap_next',
          eligibilityOverride: hasChatContentForSummary(),
        })
  ).finally(() => {
    pendingRoadmapFinalize.value = null;
  });

  return pendingRoadmapFinalize.value;
}

defineExpose({
  isEligible,
  eligibilityProgress,
  finalizeForRoadmapNext,
});
</script>
