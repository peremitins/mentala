<template>
  <div class="flex flex-col flex-1 h-full">
    <PageHeader
      title="Ассистент"
      :show-back-button="true"
      @go-back="goBackToHome"
    >
      <template #custom>
        <div class="flex items-center gap-2">
          <img
            src="../assets/images/ai_terapist.webp"
            alt="ИИ-ассистент"
            class="h-7 w-7 select-none object-contain"
          />
          <h1 class="text-xl font-bold text-foreground">Ассистент</h1>
        </div>
      </template>
    </PageHeader>

    <ChatRoom mode="page" />
  </div>
</template>

<script setup lang="ts">
/**
 * Страница `/chat` — тонкая обёртка вокруг `ChatRoom.vue`.
 *
 * Вся lifecycle/voice/feedback-логика живёт в ChatRoom, чтобы тот же UI можно было
 * встроить в Roadmap-шаг (Этап 5 — ProgramAiChatAction). См. полную карту lifecycle:
 * `.docs/audit_chat_lifecycle.md` + `.docs/retention/retention_long_term_strategy.md`.
 */
import { useRouter } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import ChatRoom from '@/app/components/chat/ChatRoom.vue';

const router = useRouter();

function goBackToHome() {
  void router.push('/');
}
</script>
