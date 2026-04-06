<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="forceUpdateRequired" class="force-update-blocker">
        <div class="force-update-content">
          <div class="force-update-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>

          <h1 class="force-update-title">
            {{ displayTitle }}
          </h1>

          <p class="force-update-message">
            {{ displayMessage }}
          </p>

          <button class="force-update-button" @click="openStore">
            {{
              $t ? $t('update_policy.update_button', 'Обновить') : 'Обновить'
            }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useUpdatePolicy } from '@/app/composables/useUpdatePolicy';

const { forceUpdateRequired, updateInfo, openStore } = useUpdatePolicy();

const displayTitle = computed(
  () => updateInfo.value?.title || 'Обновите приложение'
);

const displayMessage = computed(
  () =>
    updateInfo.value?.message ||
    'Доступна новая версия Mentala. Пожалуйста, обновите приложение для продолжения работы.'
);
</script>

<style scoped>
.force-update-blocker {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background, #1b1b3a);
  padding: 24px;
}

.force-update-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 360px;
  gap: 16px;
}

.force-update-icon {
  color: var(--color-primary, #9b78ff);
  margin-bottom: 8px;
  opacity: 0.9;
}

.force-update-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-foreground, #ffffff);
  margin: 0;
  line-height: 1.3;
}

.force-update-message {
  font-size: 15px;
  color: var(--color-muted-foreground, rgba(255, 255, 255, 0.65));
  margin: 0;
  line-height: 1.5;
}

.force-update-button {
  margin-top: 8px;
  padding: 14px 40px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary, #9b78ff);
  color: var(--color-primary-foreground, #ffffff);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
  width: 100%;
  max-width: 280px;
}

.force-update-button:active {
  opacity: 0.8;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
