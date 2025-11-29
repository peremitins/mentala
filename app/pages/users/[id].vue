<template>
  <div class="flex flex-1 relative overflow-hidden p-2">
    <section
      class="flex-auto"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <h2 class="text-lg font-semibold mb-4">
        Редактировать пользователя #{{ id }}
      </h2>

      <form class="space-y-3" @submit.prevent="onSubmit">
        <Input
          v-model="email"
          type="email"
          placeholder="email@example.com"
          :show-clear-button="false"
        />
        <Input
          v-model="name"
          type="text"
          placeholder="Имя (опционально)"
          :show-clear-button="false"
        />
        <Input
          v-model="password"
          type="password"
          placeholder="Новый пароль (необязательно)"
          :show-clear-button="false"
        />
        <Input
          v-model="confirm"
          type="password"
          placeholder="Подтверждение пароля"
          :show-clear-button="false"
        />
        <div class="flex items-center gap-2">
          <Button type="submit" variant="outline" :disabled="saving">
            Сохранить
          </Button>
          <Button as-child variant="outline">
            <NuxtLink to="/users">Отмена</NuxtLink>
          </Button>
        </div>
        <div v-if="error" class="text-destructive text-sm">{{ error }}</div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Input } from '@/app/components/ui/shadcn/input';
import { Button } from '@/app/components/ui/button';

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
    await useAPI(`/api/users/${id.value}`, {
      method: 'PATCH',
      body: {
        email: email.value.trim(),
        name: name.value.trim() || undefined,
        password: password.value || undefined,
      },
    });

    useToast('Готово', 'Пользователь обновлён');
    await navigateTo('/users');
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Ошибка сохранения';
  } finally {
    saving.value = false;
  }
}
</script>
