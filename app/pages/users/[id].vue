<template>
  <div class="flex flex-1 relative overflow-hidden p-2">
    <section
      class="flex-auto glass-deep p-2"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <h2 class="text-lg font-semibold mb-4">
        Редактировать пользователя #{{ id }}
      </h2>

      <form class="space-y-3" @submit.prevent="onSubmit">
        <input
          v-model="email"
          placeholder="email@example.com"
          class="w-full bg-transparent border border-white/15 rounded-md px-3 py-2 outline-none placeholder:text-white/60"
        />
        <input
          v-model="name"
          placeholder="Имя (опционально)"
          class="w-full bg-transparent border border-white/15 rounded-md px-3 py-2 outline-none placeholder:text-white/60"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Новый пароль (необязательно)"
          class="w-full bg-transparent border border-white/15 rounded-md px-3 py-2 outline-none placeholder:text-white/60"
        />
        <input
          v-model="confirm"
          type="password"
          placeholder="Подтверждение пароля"
          class="w-full bg-transparent border border-white/15 rounded-md px-3 py-2 outline-none placeholder:text-white/60"
        />
        <div class="flex items-center gap-2">
          <button class="glass px-4 py-2" :disabled="saving">Сохранить</button>
          <NuxtLink class="glass px-4 py-2" to="/users">Отмена</NuxtLink>
        </div>
        <div v-if="error" class="text-red-400 text-sm">{{ error }}</div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const id = computed(() => Number(route.params.id));
const email = ref('');
const name = ref('');
const password = ref('');
const confirm = ref('');
const saving = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const res = await $fetch<{
      item: { id: number; email: string | null; name: string | null };
    }>(`/api/users/${id.value}`);
    email.value = res.item.email || '';
    name.value = res.item.name || '';
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Ошибка загрузки';
  }
});

async function onSubmit() {
  error.value = '';
  if (!email.value.trim()) {
    error.value = 'Email обязателен';
    return;
  }
  if (password.value && password.value.length < 6) {
    error.value = 'Пароль слишком короткий';
    return;
  }
  if (password.value && password.value !== confirm.value) {
    error.value = 'Пароли не совпадают';
    return;
  }
  saving.value = true;
  try {
    const { status } = await useAPI(`/api/users/${id.value}`, {
      method: 'PATCH',
      body: {
        email: email.value.trim(),
        name: name.value.trim() || undefined,
        password: password.value || undefined,
      },
    });

    if (status.value === 'success') {
      useToast('Готово', 'Пользователь обновлён', 'success');
      await navigateTo('/users');
    }
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Ошибка сохранения';
  } finally {
    saving.value = false;
  }
}
</script>
