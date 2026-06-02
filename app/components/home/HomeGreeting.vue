<template>
  <div class="glass-deep p-4 animate-slide-up">
    <h1 class="text-[16px] font-semibold leading-tight text-foreground">
      {{ greetingText }}
    </h1>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { getCurrentGreeting } from '@/app/utils/greeting';
import { extractGreetingName } from '@/shared/utils/greetingName';

const authStore = useAuthStore();

const greeting = ref('Здравствуйте');

// Имя берём тем же хелпером, что и приветствие в ИИ-чате (extractGreetingName,
// вынесен в shared): он отсеивает email/логины/стоп-слова, не обращается по
// фамилии и возвращает только корректное имя. Если имя использовать нельзя —
// приветствуем без него.
const firstName = computed(() => extractGreetingName(authStore.user?.name));

// С именем — «Добрый вечер, Алёна». Без имени — «Добрый вечер!» (восклицание
// вместо запятой, чтобы фраза звучала завершённо).
const greetingText = computed(() =>
  firstName.value
    ? `${greeting.value}, ${firstName.value}`
    : `${greeting.value}!`
);

function refresh() {
  greeting.value = getCurrentGreeting(new Date());
}

onMounted(() => {
  refresh();
});
</script>
