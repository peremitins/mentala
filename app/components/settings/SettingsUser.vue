<template>
  <div class="space-y-2">
    <section class="space-y-4">
      <div v-if="loading" class="text-sm text-foreground">Загрузка...</div>

      <div v-else-if="user" class="space-y-4">
        <section class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-4">
          <!-- Email -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground"> Email </label>
            <Input
              :model-value="user.email || 'Не указан'"
              type="email"
              disabled
              :show-clear-button="false"
            />
          </div>

          <!-- Name -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground"> Имя </label>
            <Input
              v-model="editableName"
              type="text"
              maxlength="40"
              :show-clear-button="false"
              placeholder="Имя или никнейм"
            />
            <p v-if="nameError" class="text-xs text-destructive">
              {{ nameError }}
            </p>
          </div>

          <!-- Gender -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground"> Пол </label>
            <ToggleButtonGroup
              v-model="gender"
              :options="genderOptions"
              layout="flex"
              size="sm"
              variant="outline"
              item-max-width="200px"
            />
          </div>

          <Button
            class="relative w-fit bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canSaveProfile"
            @click="saveProfile"
          >
            <ButtonLoader v-if="savingProfile" />
            <span :class="savingProfile ? 'invisible' : ''">Сохранить</span>
          </Button>
        </section>
      </div>

      <div v-else class="text-sm text-destructive">
        Не удалось загрузить информацию о пользователе
      </div>
    </section>

    <!-- Email verification -->
    <section
      v-if="user"
      class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-4"
    >
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-foreground">Email</h3>
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center rounded-full px-2.5 py-1 text-xs"
            :class="
              emailVerified
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-300'
            "
          >
            {{ emailVerified ? 'Подтвержден' : 'Не подтвержден' }}
          </span>
          <Button
            v-if="!emailVerified"
            size="sm"
            variant="secondary"
            :disabled="emailVerificationLoading || emailResendRemaining > 0"
            @click="sendVerificationCode"
          >
            {{
              emailResendRemaining > 0
                ? `Повтор через ${emailResendRemaining}с`
                : 'Отправить код'
            }}
          </Button>
        </div>
      </div>

      <div v-if="showEmailCodeInput" class="space-y-3">
        <div>
          <label class="block text-sm mb-1 text-foreground">
            Код подтверждения
          </label>
          <Input
            v-model="emailCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            autocomplete="one-time-code"
            :show-clear-button="false"
            @input="onEmailCodeInput"
          />
        </div>
        <div class="text-xs text-foreground" v-if="emailAttemptsLeft !== null">
          Осталось попыток: {{ emailAttemptsLeft }}
        </div>
        <Button
          class="relative"
          :disabled="emailVerificationLoading"
          @click="confirmVerificationCode"
        >
          <ButtonLoader v-if="emailVerificationLoading" />
          <span :class="emailVerificationLoading ? 'invisible' : ''">
            Подтвердить email
          </span>
        </Button>
      </div>
    </section>

    <!-- Password management -->
    <section
      v-if="user"
      class="scroll-mt-24 rounded-lg glass-deep p-4 space-y-4"
    >
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-foreground">Пароль</h3>
        <p class="text-sm text-foreground">
          {{
            hasPassword
              ? 'Измените пароль для входа по email.'
              : 'Установите пароль для входа по email и паролю.'
          }}
        </p>
      </div>

      <div v-if="!hasPassword" class="space-y-3">
        <div>
          <label class="block text-sm mb-1 text-foreground">Новый пароль</label>
          <Input
            v-model="newPassword"
            type="password"
            minlength="8"
            :show-clear-button="false"
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-foreground"
            >Повторите пароль</label
          >
          <Input
            v-model="confirmPassword"
            type="password"
            minlength="8"
            :show-clear-button="false"
          />
        </div>
        <Button
          class="relative"
          :disabled="passwordLoading"
          @click="handleSetPassword"
        >
          <ButtonLoader v-if="passwordLoading" />
          <span :class="passwordLoading ? 'invisible' : ''">
            Установить пароль
          </span>
        </Button>
      </div>

      <div v-else class="space-y-3">
        <div>
          <label class="block text-sm mb-1 text-foreground"
            >Текущий пароль</label
          >
          <Input
            v-model="currentPassword"
            type="password"
            :show-clear-button="false"
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-foreground">Новый пароль</label>
          <Input
            v-model="newPassword"
            type="password"
            minlength="8"
            :show-clear-button="false"
          />
        </div>
        <div>
          <label class="block text-sm mb-1 text-foreground"
            >Повторите пароль</label
          >
          <Input
            v-model="confirmPassword"
            type="password"
            minlength="8"
            :show-clear-button="false"
          />
        </div>
        <Button
          class="relative"
          :disabled="passwordLoading"
          @click="handleChangePassword"
        >
          <ButtonLoader v-if="passwordLoading" />
          <span :class="passwordLoading ? 'invisible' : ''">
            Изменить пароль
          </span>
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useCountdown } from '@vueuse/core';
import { useAuthStore } from '@/app/stores/auth';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import { Button } from '@/app/components/ui/button';
import ToggleButtonGroup from '@/app/components/ui/ToggleButtonGroup.vue';
import { useToast } from '@/app/composables/useToast';
import type { Gender } from '@/shared/dto/onboarding';

const auth = useAuthStore();
const user = ref<any>(null);
const loading = ref(true);
const editableName = ref('');
const gender = ref<Gender | null>(null);
const savingProfile = ref(false);
const initialProfile = ref<{ name: string; gender: Gender | null } | null>(
  null
);

const emailCode = ref('');
const emailAttemptsLeft = ref<number | null>(null);
const emailVerificationLoading = ref(false);
const showEmailCodeInput = ref(false);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordLoading = ref(false);

const {
  remaining: emailResendRemaining,
  start: startEmailCountdown,
  reset: resetEmailCountdown,
} = useCountdown(0);

const emailVerified = computed(() => !!user.value?.emailVerifiedAt);
const hasPassword = computed(() => !!user.value?.hasPassword);
const normalizedName = computed(() => editableName.value.trim());
const nameError = computed(() => {
  const trimmed = normalizedName.value;
  if (!trimmed) return 'Имя не может быть пустым';
  if (trimmed.length > 40) return 'Максимум 40 символов';
  return '';
});
const isProfileDirty = computed(() => {
  if (!initialProfile.value) return false;
  return (
    normalizedName.value !== initialProfile.value.name ||
    gender.value !== initialProfile.value.gender
  );
});
const canSaveProfile = computed(() => {
  return (
    !nameError.value &&
    !!gender.value &&
    !savingProfile.value &&
    isProfileDirty.value
  );
});

const genderOptions = [
  { value: 'male' as Gender, label: 'Мужской' },
  { value: 'female' as Gender, label: 'Женский' },
];

onMounted(async () => {
  try {
    if (!auth.user) {
      await auth.me();
    }
    user.value = auth.user;
    editableName.value = user.value?.name || '';
    gender.value = (user.value as any)?.gender || null;
    initialProfile.value = {
      name: normalizedName.value,
      gender: gender.value,
    };
  } catch (error) {
    console.error('Не удалось загрузить данные пользователя:', error);
  } finally {
    loading.value = false;
  }
});

async function saveProfile() {
  if (!user.value || savingProfile.value) return;
  if (nameError.value || !gender.value) {
    useToast('Ошибка', 'Заполните имя и выберите пол', 'error');
    return;
  }

  savingProfile.value = true;
  try {
    const response = await useAPI<{ item?: any }>(
      `/api/users/${user.value.id}`,
      {
        method: 'PATCH',
        body: {
          name: editableName.value.trim(),
          gender: gender.value,
        },
      }
    );

    if (response?.item) {
      const updated = response.item;
      user.value = {
        ...user.value,
        name: updated.name ?? user.value?.name,
        gender: updated.gender ?? (user.value as any)?.gender,
        ageRange: updated.ageRange ?? (user.value as any)?.ageRange,
      };
      if (auth.user) {
        auth.user.name = updated.name ?? auth.user.name;
        (auth.user as any).gender = updated.gender ?? (auth.user as any).gender;
        (auth.user as any).ageRange =
          updated.ageRange ?? (auth.user as any).ageRange;
      }
      initialProfile.value = {
        name: normalizedName.value,
        gender: gender.value,
      };
      useToast('Сохранено', 'Профиль обновлён');
    } else {
      useToast('Ошибка', 'Не удалось обновить профиль', 'error');
    }
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    const message = payload?.message || 'Не удалось обновить профиль';
    useToast('Ошибка', String(message), 'error');
  } finally {
    savingProfile.value = false;
  }
}

function onEmailCodeInput() {
  emailCode.value = emailCode.value.replace(/\D/g, '').slice(0, 6);
}

function startEmailTimer(seconds = 60) {
  resetEmailCountdown(seconds);
  startEmailCountdown();
}

async function sendVerificationCode() {
  if (!user.value?.email) return;
  try {
    emailVerificationLoading.value = true;
    const response: any = await auth.requestEmailVerification({
      email: user.value.email,
    });
    const retryAfter = response?.retryAfter ? Number(response.retryAfter) : 60;
    startEmailTimer(Number.isFinite(retryAfter) ? retryAfter : 60);
    showEmailCodeInput.value = true;
    if (response?.retryAfter) {
      const minutes = Math.floor(retryAfter / 60);
      const seconds = retryAfter % 60;
      useToast(
        'Слишком часто',
        `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
        'warning'
      );
    } else {
      useToast('Код отправлен', 'Проверьте почту');
    }
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    const message = payload?.message || 'Не удалось отправить код';
    useToast('Ошибка', String(message), 'error');
  } finally {
    emailVerificationLoading.value = false;
  }
}

async function confirmVerificationCode() {
  const code = emailCode.value.replace(/\D/g, '');
  if (!user.value?.email || code.length !== 6) {
    useToast('Ошибка', 'Введите 6-значный код', 'error');
    return;
  }

  try {
    emailVerificationLoading.value = true;
    await auth.verifyEmailCode(
      { email: user.value.email, code },
      { redirect: null }
    );
    user.value = auth.user;
    showEmailCodeInput.value = false;
    emailCode.value = '';
    emailAttemptsLeft.value = null;
    useToast('Email подтвержден', 'Спасибо!');
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    emailAttemptsLeft.value =
      payload?.data?.attemptsLeft ?? emailAttemptsLeft.value;
    const message = payload?.message || 'Не удалось подтвердить email';
    useToast('Ошибка', String(message), 'error');
  } finally {
    emailVerificationLoading.value = false;
  }
}

async function handleSetPassword() {
  if (!newPassword.value || !confirmPassword.value) {
    useToast('Ошибка', 'Заполните поля пароля', 'error');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    useToast('Ошибка', 'Пароли не совпадают', 'error');
    return;
  }
  if (newPassword.value.length < 8) {
    useToast('Ошибка', 'Минимум 8 символов', 'error');
    return;
  }

  try {
    passwordLoading.value = true;
    await auth.setPassword({
      password: newPassword.value,
      confirmPassword: confirmPassword.value,
    });
    if (auth.user) {
      auth.user.hasPassword = true;
    }
    user.value = auth.user;
    newPassword.value = '';
    confirmPassword.value = '';
    useToast('Пароль установлен', 'Теперь вы можете входить по email и паролю');
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    const message = payload?.message || 'Не удалось установить пароль';
    useToast('Ошибка', String(message), 'error');
  } finally {
    passwordLoading.value = false;
  }
}

async function handleChangePassword() {
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    useToast('Ошибка', 'Заполните все поля', 'error');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    useToast('Ошибка', 'Пароли не совпадают', 'error');
    return;
  }
  if (newPassword.value.length < 8) {
    useToast('Ошибка', 'Минимум 8 символов', 'error');
    return;
  }

  try {
    passwordLoading.value = true;
    await auth.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      confirmPassword: confirmPassword.value,
    });
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    useToast('Пароль обновлен', 'Мы вышли с других устройств');
  } catch (error: any) {
    const payload = error?.data || error?.response?._data || {};
    const message = payload?.message || 'Не удалось изменить пароль';
    useToast('Ошибка', String(message), 'error');
  } finally {
    passwordLoading.value = false;
  }
}
</script>
