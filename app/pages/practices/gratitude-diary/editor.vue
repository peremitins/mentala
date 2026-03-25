<template>
  <div class="h-100vh overflow-y-auto rounded-lg">
    <div class="flex flex-col pb-[170px] overflow-auto space-y-2">
      <PageHeader :show-back-button="true" title="" @go-back="goBack">
        <template #custom>
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="truncate text-xl font-bold text-foreground">
              {{
                isEditMode
                  ? t('GRATITUDE_DIARY.EDITOR_TITLE_EDIT')
                  : t('GRATITUDE_DIARY.EDITOR_TITLE_CREATE')
              }}
            </h1>
          </div>
        </template>
        <template #trailing>
          <Popover v-model:open="isEntryDatePickerOpen">
            <PopoverTrigger as-child>
              <button
                type="button"
                class="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-foreground/80 transition hover:border-white/20 hover:text-foreground"
                :aria-label="t('GRATITUDE_DIARY.ENTRY_DATE_PICKER_ARIA')"
                :title="selectedEntryDateLabel"
              >
                <IconCalendarDays class="h-4 w-4" />
                <span
                  v-if="!isSelectedEntryDateToday"
                  class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary-ui"
                />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              class="w-[min(320px,calc(100vw-1rem))] border-none bg-transparent p-0 shadow-none"
            >
              <div
                class="glass-deep overflow-hidden rounded-[30px] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.32)]"
              >
                <div class="px-1 pb-2">
                  <p
                    class="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45"
                  >
                    {{ t('GRATITUDE_DIARY.ENTRY_DATE_LABEL') }}
                  </p>
                  <p class="mt-1 text-sm font-semibold text-foreground">
                    {{ selectedEntryDateLabel }}
                  </p>
                </div>

                <Calendar
                  :model-value="calendarEntryDate"
                  :locale="calendarLocale"
                  :week-starts-on="calendarWeekStartsOn"
                  :max-value="maxSelectableEntryDate"
                  :default-placeholder="calendarPlaceholder"
                  :placeholder="calendarPlaceholder"
                  :initial-focus="true"
                  @update:model-value="handleCalendarEntryDateChange"
                />
              </div>
            </PopoverContent>
          </Popover>

          <button
            v-if="isEditMode"
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-foreground/80 transition hover:border-white/20 hover:text-destructive"
            :aria-label="t('GRATITUDE_DIARY.DELETE_ENTRY_ARIA')"
            :disabled="isDeleting"
            @click="deleteModalRef?.open()"
          >
            <IconTrash2 class="h-4 w-4" />
          </button>
        </template>
      </PageHeader>

      <!-- Секция вопроса: пока идёт загрузка показываем скелет, после — актуальный вопрос -->
      <section class="glass-deep p-4 space-y-3">
        <template v-if="isPageLoading">
          <div class="h-6 w-3/4 animate-pulse rounded-md bg-white/10" />
          <div class="h-4 w-1/2 animate-pulse rounded-md bg-white/10" />
        </template>
        <template v-else>
          <!-- Текст вопроса со крестиком скрытия в правом верхнем углу -->
          <div v-if="isPromptVisible" class="relative">
            <p class="pr-7 text-lg font-semibold leading-tight text-foreground">
              {{ activePrompt?.text || diaryT('DEFAULT_PROMPT') }}
            </p>
            <button
              type="button"
              class="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full text-foreground/50 transition hover:text-foreground/80"
              :aria-label="t('GRATITUDE_DIARY.HIDE_PROMPT')"
              @click="isPromptVisible = false"
            >
              <IconX class="h-4 w-4" />
            </button>
          </div>

          <div class="flex items-center gap-2">
            <!-- Когда вопрос скрыт — кнопка «Добавить вопрос» с плюсом, иначе — «Случайный вопрос» -->
            <Button
              v-if="!isPromptVisible"
              variant="outline"
              size="sm"
              @click="
                isPromptVisible = true;
                setRandomPrompt();
              "
            >
              <IconPlus class="mr-1.5 h-4 w-4" />
              {{ t('GRATITUDE_DIARY.ADD_PROMPT') }}
            </Button>
            <Button v-else variant="outline" size="sm" @click="setRandomPrompt">
              <IconRefreshCw class="mr-1.5 h-4 w-4" />
              {{ t('GRATITUDE_DIARY.NEW_PROMPT') }}
            </Button>

            <Button
              v-if="isPromptVisible"
              variant="outline"
              size="sm"
              @click="isPromptCatalogOpen = true"
            >
              {{ t('GRATITUDE_DIARY.SHOW_ALL') }}
            </Button>
          </div>
        </template>
      </section>

      <section class="glass-deep flex flex-col h-full p-4 space-y-3">
        <div
          class="relative h-full overflow-hidden rounded-2xl border border-white/15 bg-black/20 pb-[40px]"
        >
          <textarea
            ref="textareaRef"
            v-model="entryText"
            class="min-h-[100px] !h-full w-full resize-none bg-transparent p-3 pb-9 text-sm text-foreground outline-none placeholder:text-foreground/45"
            :placeholder="t('GRATITUDE_DIARY.TEXT_PLACEHOLDER')"
            :maxlength="2000"
            @input="handleTextareaInput"
            @keydown.enter="handleTextareaEnter"
          />
          <div
            class="pointer-events-none absolute left-2 bottom-2 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] font-medium text-foreground/70"
          >
            {{ entryText.length }}/2000
          </div>
          <button
            type="button"
            class="absolute right-10 bottom-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground transition hover:border-white/25 hover:bg-white/10"
            :aria-label="t('GRATITUDE_DIARY.WORKSHEET_TITLE')"
            @click="toggleWorksheetPanel"
          >
            <IconClipboardList class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground transition hover:border-white/25 hover:bg-white/10"
            :class="
              isListening
                ? 'ring-2 ring-red-400/60 bg-red-500/15 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                : ''
            "
            :aria-label="t('GRATITUDE_DIARY.TOOL_VOICE')"
            :aria-pressed="isListening"
            @click="toggleMic"
          >
            <IconMic class="h-4 w-4" />
          </button>
        </div>

        <div v-if="isListening" class="text-right text-xs text-red-300">
          {{ t('GRATITUDE_DIARY.LISTENING') }}
        </div>

        <div v-if="selectedMoodItem" class="flex items-center">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-primary-ui/35 bg-primary-ui/15 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary-ui/55"
            @click="toggleMoodPanel"
          >
            <span class="text-base">{{ selectedMoodItem.emoji }}</span>
            <span
              >{{ t('GRATITUDE_DIARY.TOOL_MOOD') }}:
              {{ selectedMoodItem.label }}</span
            >
          </button>
        </div>

        <div v-if="selectedTags.length" class="flex flex-wrap gap-2">
          <button
            v-for="tag in selectedTags"
            :key="tag"
            type="button"
            class="rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-xs text-foreground/85 transition hover:border-white/35"
            @click="removeTag(tag)"
          >
            #{{ tag }} ×
          </button>
        </div>

        <div
          v-if="photoPreviewUrl"
          class="relative overflow-hidden rounded-2xl border border-white/15 bg-black/20"
        >
          <img
            :src="photoPreviewUrl"
            :alt="t('GRATITUDE_DIARY.PHOTO_ALT')"
            class="max-h-[220px] h-full w-full cursor-zoom-in object-contain"
            @click="openPhotoSwipeFromImg"
            @error="handlePhotoLoadError"
          />
          <button
            type="button"
            class="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/90 shadow-lg transition hover:bg-destructive/90 hover:text-white hover:border-destructive/50"
            :aria-label="t('GRATITUDE_DIARY.REMOVE_PHOTO_ARIA')"
            @click="removePhoto"
          >
            <IconX class="h-4 w-4" />
          </button>
        </div>

        <input
          ref="photoInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="hidden"
          @change="handlePhotoSelected"
        />

        <Button class="w-full" :disabled="saveDisabled" @click="saveEntry">
          {{
            isSaving ? t('GRATITUDE_DIARY.SAVING') : t('GRATITUDE_DIARY.SAVE')
          }}
        </Button>
      </section>
    </div>

    <section class="glass-deep absolute left-1 right-1 bottom-[94px] z-30 p-3">
      <div class="flex flex-wrap gap-2 justify-between">
        <Button
          variant="outline"
          size="sm"
          class="border-none max-w-full flex-col gap-0.5 whitespace-normal !h-auto px-2 py-1.5 text-[10px] leading-tight"
          @click="toggleMoodPanel"
        >
          <IconSmile class="h-3.5 w-3.5" />
          <span>{{ t('GRATITUDE_DIARY.TOOL_MOOD') }}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="relative border-none max-w-full flex-col gap-0.5 whitespace-normal !h-auto px-2 py-1.5 text-[10px] leading-tight"
          @click="handlePhotoClick"
        >
          <IconImage class="h-3.5 w-3.5" />
          <span>{{ t('GRATITUDE_DIARY.TOOL_PHOTO') }}</span>
          <span
            v-if="!photoAccess.available"
            class="absolute right-1 top-1 text-[9px] leading-none"
          >
            {{ getPlanBadgeEmoji(photoAccess.requiredPlan) }}
          </span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="border-none max-w-full flex-col gap-0.5 whitespace-normal !h-auto px-2 py-1.5 text-[10px] leading-tight"
          :class="
            isNumberedListMode
              ? 'border-primary-ui/60 bg-primary-ui/20 text-foreground'
              : ''
          "
          @click="toggleNumberedListMode"
        >
          <IconListOrdered class="h-3.5 w-3.5" />
          <span>{{ t('GRATITUDE_DIARY.TOOL_NUMBERED_LIST') }}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="border-none max-w-full flex-col gap-0.5 whitespace-normal !h-auto px-2 py-1.5 text-[10px] leading-tight"
          @click="toggleTagPanel"
        >
          <IconTag class="h-3.5 w-3.5" />
          <span>{{ t('GRATITUDE_DIARY.TOOL_TAG') }}</span>
        </Button>
      </div>
    </section>

    <Dialog
      :open="isPromptCatalogOpen"
      @update:open="isPromptCatalogOpen = $event"
    >
      <DialogContent
        class="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] !max-w-3xl flex-col overflow-hidden border-white/10 bg-background/95 p-0"
      >
        <DialogHeader>
          <div class="px-4 pt-4">
            <DialogTitle>{{ t('GRATITUDE_DIARY.PROMPTS_TITLE') }}</DialogTitle>
            <DialogDescription>
              {{ diaryT('PROMPTS_SUBTITLE') }}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div class="min-h-0 min-w-0 flex-1 space-y-3 px-4 pb-4 overflow-y-auto">
          <input
            v-model="promptSearch"
            type="search"
            class="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/45"
            :placeholder="t('GRATITUDE_DIARY.SEARCH_PROMPTS')"
          />

          <div
            class="min-w-0 max-w-full overflow-x-auto no-scrollbar"
            style="touch-action: pan-y pan-x"
          >
            <div class="inline-flex min-w-max gap-2">
              <button
                v-for="category in promptCategoriesWithFavorites"
                :key="category.id"
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition"
                :class="
                  activePromptCategoryId === category.id
                    ? 'border-white/40 bg-white/15 text-foreground'
                    : 'border-white/15 bg-white/5 text-foreground/80 hover:border-white/30'
                "
                @click="activePromptCategoryId = category.id"
              >
                <span v-if="category.emoji" class="text-base leading-none">{{
                  category.emoji
                }}</span>
                <span>{{ category.title }}</span>
              </button>
            </div>
          </div>

          <div
            class="min-h-0 flex-1 overflow-y-auto space-y-2"
            @touchstart.passive="handlePromptListTouchStart"
            @touchend.passive="handlePromptListTouchEnd"
          >
            <div
              v-if="!visiblePrompts.length"
              class="py-8 text-center text-sm text-foreground/65"
            >
              {{
                promptSearch.trim()
                  ? t('GRATITUDE_DIARY.PROMPTS_EMPTY_SEARCH')
                  : activePromptCategoryId === 'favorites'
                    ? diaryT('PROMPTS_EMPTY_FAVORITES')
                    : t('GRATITUDE_DIARY.PROMPTS_EMPTY_CATEGORY')
              }}
            </div>

            <div
              v-for="prompt in visiblePrompts"
              :key="prompt.id"
              class="rounded-2xl border border-white/12 bg-black/20 p-2.5"
            >
              <div class="flex items-start gap-2">
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left text-sm leading-relaxed text-foreground/90"
                  @click="selectPrompt(prompt)"
                >
                  {{ prompt.text }}
                </button>
                <div class="flex items-center gap-1">
                  <template v-if="activePromptCategoryId === 'favorites'">
                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/75 transition hover:bg-white/10 hover:text-foreground"
                      :aria-label="
                        t('GRATITUDE_DIARY.PROMPTS_EDIT_FAVORITE_ARIA')
                      "
                      @click="openEditFavoritePromptModal(prompt)"
                    >
                      <IconPencil class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/75 transition hover:bg-white/10 hover:text-foreground"
                      :aria-label="
                        t('GRATITUDE_DIARY.PROMPTS_DELETE_FAVORITE_ARIA')
                      "
                      @click="removeFavoritePrompt(prompt)"
                    >
                      <IconTrash2 class="h-4 w-4" />
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 p-2 text-white transition hover:bg-black/70"
                    :aria-label="
                      isPromptFavorite(prompt.id)
                        ? t(
                            'GRATITUDE_DIARY.PROMPTS_REMOVE_FROM_FAVORITES_ARIA'
                          )
                        : t('GRATITUDE_DIARY.PROMPTS_ADD_TO_FAVORITES_ARIA')
                    "
                    @click="togglePromptFavorite(prompt)"
                  >
                    <IconHeart
                      class="h-4 w-4"
                      :class="
                        isPromptFavorite(prompt.id)
                          ? 'text-red-500 [&>path]:fill-current [&>path]:stroke-current'
                          : '[&>path]:fill-none [&>path]:stroke-current'
                      "
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="activePromptCategoryId === 'favorites'" class="pt-1">
            <Button class="w-full" @click="openCreateFavoritePromptModal">
              {{ t('GRATITUDE_DIARY.PROMPTS_ADD_FAVORITE') }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="isFavoritePromptModalOpen"
      @update:open="isFavoritePromptModalOpen = $event"
    >
      <DialogContent
        class="w-[calc(100vw-1rem)] max-w-md border-white/10 bg-background/95"
      >
        <DialogHeader>
          <DialogTitle>
            {{
              favoritePromptModalMode === 'edit'
                ? t('GRATITUDE_DIARY.PROMPTS_MODAL_EDIT_TITLE')
                : t('GRATITUDE_DIARY.PROMPTS_MODAL_ADD_TITLE')
            }}
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-3">
          <TextareaResize
            ref="favoritePromptInputRef"
            v-model="favoritePromptDraft"
            class="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/45"
            :placeholder="diaryT('PROMPTS_CREATE_FAVORITE_PLACEHOLDER')"
            :max-length="220"
            :min-height="'96px'"
            :max-height="'220px'"
            :prevent-enter-default="false"
          />
          <Button class="w-full" @click="submitFavoritePromptModal">
            {{ t('GRATITUDE_DIARY.PROMPTS_MODAL_DONE') }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Transition
      enter-active-class="transition-opacity duration-250 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <button
        v-if="isMoodOpen || isTagInputOpen || isWorksheetOpen"
        type="button"
        class="fixed inset-0 z-40 bg-black/45"
        :aria-label="t('GRATITUDE_DIARY.CLOSE_PANEL')"
        @click="closeFloatingPanels"
      />
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-8 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-6 opacity-0"
    >
      <section
        v-if="isMoodOpen"
        class="glass-deep absolute left-1 right-1 bottom-[94px] z-50 p-3"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-foreground">
            {{ diaryT('SELECT_MOOD') }}
          </p>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-foreground/75 transition hover:border-white/35 hover:text-foreground"
            :aria-label="t('GRATITUDE_DIARY.CLOSE_PANEL')"
            @click="isMoodOpen = false"
          >
            <IconX class="h-4 w-4" />
          </button>
        </div>
        <div class="flex flex-wrap gap-2 justify-center">
          <button
            v-for="moodItem in moods"
            :key="moodItem.value"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition"
            :class="
              selectedMood === moodItem.value
                ? 'border-primary-ui/60 bg-primary-ui/20 text-foreground'
                : 'border-white/15 bg-black/20 text-foreground/80 hover:border-white/25'
            "
            @click="selectMood(moodItem.value)"
          >
            <span class="text-base leading-none">{{ moodItem.emoji }}</span>
            <span class="whitespace-nowrap">{{ moodItem.label }}</span>
          </button>
        </div>
      </section>
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-8 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-6 opacity-0"
    >
      <section
        v-if="isWorksheetOpen"
        class="glass-deep absolute left-1 right-1 bottom-[94px] z-50 p-3"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-foreground">
              {{ t('GRATITUDE_DIARY.WORKSHEET_TITLE') }}
            </p>
            <p class="text-xs text-foreground/70">
              {{ t('GRATITUDE_DIARY.WORKSHEET_SUBTITLE') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-foreground/75 transition hover:border-white/35 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              :aria-label="t('GRATITUDE_DIARY.RESTORE_DEFAULT_WORKSHEET')"
              :title="t('GRATITUDE_DIARY.RESTORE_DEFAULT_WORKSHEET')"
              :disabled="isRestoreWorksheetDisabled"
              @click="restoreDefaultWorksheetDraft"
            >
              <IconHistory class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-foreground/75 transition hover:border-white/35 hover:text-foreground"
              :aria-label="t('GRATITUDE_DIARY.CLOSE_PANEL')"
              @click="isWorksheetOpen = false"
            >
              <IconX class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="rounded-2xl border border-white/15 bg-black/20 p-3">
          <ul class="space-y-2">
            <li
              v-for="(worksheetItem, index) in worksheetDraft"
              :key="worksheetItem.id"
              class="flex items-center gap-2 text-sm text-foreground/90"
            >
              <template v-if="isEditingWorksheet">
                <input
                  :value="worksheetItem.emoji"
                  type="text"
                  class="w-12 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-center text-sm text-foreground outline-none"
                  maxlength="16"
                  @input="
                    updateWorksheetDraftEmoji(
                      index,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
                <input
                  :value="worksheetItem.text"
                  type="text"
                  class="flex-1 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm text-foreground outline-none"
                  maxlength="180"
                  @input="
                    updateWorksheetDraftText(
                      index,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
                <button
                  type="button"
                  class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/20 text-foreground/75 transition hover:border-white/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  :disabled="worksheetDraft.length <= 1"
                  :aria-label="t('GRATITUDE_DIARY.REMOVE_WORKSHEET_ROW')"
                  @click="removeWorksheetDraftRow(index)"
                >
                  <IconTrash2 class="h-4 w-4" />
                </button>
              </template>
              <template v-else>
                <span>{{ worksheetItem.emoji || '•' }}</span>
                <span>{{ worksheetItem.text }}</span>
              </template>
            </li>
          </ul>
        </div>

        <Button
          v-if="canEditWorksheet && isEditingWorksheet"
          variant="outline"
          class="mt-3 w-full"
          :disabled="worksheetDraft.length >= MAX_WORKSHEET_ROWS"
          @click="addWorksheetDraftRow"
        >
          <IconPlus class="mr-1.5 h-4 w-4" />
          {{ t('GRATITUDE_DIARY.ADD_WORKSHEET_ROW') }}
        </Button>

        <div class="mt-3 flex gap-2">
          <Button
            v-if="!isEditingWorksheet"
            variant="outline"
            class="relative flex-1"
            @click="startWorksheetEditing"
          >
            <IconPencil class="mr-1.5 h-4 w-4" />
            {{ t('GRATITUDE_DIARY.EDIT_WORKSHEET') }}
            <span v-if="!canEditWorksheet" class="ml-1.5 text-xs leading-none">
              {{ getPlanBadgeEmoji(worksheetAccess.requiredPlan) }}
            </span>
          </Button>
          <template v-if="canEditWorksheet && isEditingWorksheet">
            <Button
              variant="outline"
              class="flex-1"
              @click="cancelWorksheetEditing"
            >
              <IconRotateCcw class="mr-1.5 h-4 w-4" />
              {{ t('GRATITUDE_DIARY.CANCEL_EDIT_WORKSHEET') }}
            </Button>
            <Button
              class="flex-1"
              :disabled="isSavingWorksheet"
              @click="saveWorksheet"
            >
              <IconCheck class="mr-1.5 h-4 w-4" />
              {{
                isSavingWorksheet
                  ? t('GRATITUDE_DIARY.SAVING_WORKSHEET')
                  : t('GRATITUDE_DIARY.SAVE_WORKSHEET')
              }}
            </Button>
          </template>
        </div>

        <Button class="mt-2 w-full" @click="applyWorksheetTemplate">
          {{ t('GRATITUDE_DIARY.START_WRITING') }}
        </Button>
      </section>
    </Transition>

    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-8 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-6 opacity-0"
    >
      <section
        v-if="isTagInputOpen"
        class="glass-deep absolute left-1 right-1 bottom-[94px] z-50 p-3"
      >
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-foreground">
            {{ t('GRATITUDE_DIARY.TAGS_TITLE') }}
          </p>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-foreground/75 transition hover:border-white/35 hover:text-foreground"
            :aria-label="t('GRATITUDE_DIARY.CLOSE_PANEL')"
            @click="isTagInputOpen = false"
          >
            <IconX class="h-4 w-4" />
          </button>
        </div>
        <div class="flex gap-2 items-center">
          <input
            v-model="tagDraft"
            type="text"
            class="flex-1 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/45"
            :placeholder="diaryT('TAG_PLACEHOLDER')"
            @keydown.enter.prevent="addTag"
          />
          <Button size="sm" variant="outline" @click="addTag">
            {{ t('GRATITUDE_DIARY.ADD_TAG') }}
          </Button>
        </div>
      </section>
    </Transition>

    <ConfirmModal
      ref="deleteModalRef"
      :title="t('GRATITUDE_DIARY.DELETE_CONFIRM_TITLE')"
      :confirm-label="t('GRATITUDE_DIARY.DELETE_CONFIRM_BUTTON')"
      :cancel-label="t('GRATITUDE_DIARY.DELETE_CONFIRM_CANCEL')"
      @confirm="deleteEntry"
    />

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan ?? null"
      :paywall="paywallAccess?.paywall ?? null"
    />
  </div>
</template>

<script setup lang="ts">
import {
  DateFormatter,
  getLocalTimeZone,
  parseDate,
  today,
} from '@internationalized/date';
import type { CalendarRootProps } from 'reka-ui';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { navigateTo, useNuxtApp } from '#app';
import { useRoute } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import { Button } from '@/app/components/ui/button';
import Calendar from '@/app/components/ui/calendar/Calendar.vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/shadcn/popover';
import { useVoiceDictationInput } from '@/app/composables/useVoiceDictationInput';
import { useToast } from '@/app/composables/useToast';
import { useEntitlements } from '@/app/composables/useEntitlements';
import {
  useGratitudeDiaryFavorites,
  type FavoritePromptItem,
} from '@/app/composables/useGratitudeDiaryFavorites';
import { usePhotoSwipe } from '@/app/composables/usePhotoSwipe';
import { useAuthStore } from '@/app/stores/auth';
import IconRefreshCw from '~icons/lucide/refresh-cw';
import IconMic from '~icons/lucide/mic';
import IconX from '~icons/lucide/x';
import IconSmile from '~icons/lucide/smile';
import IconImage from '~icons/lucide/image';
import IconClipboardList from '~icons/lucide/clipboard-list';
import IconListOrdered from '~icons/lucide/list-ordered';
import IconTag from '~icons/lucide/tag';
import IconPencil from '~icons/lucide/pencil';
import IconRotateCcw from '~icons/lucide/rotate-ccw';
import IconCheck from '~icons/lucide/check';
import IconPlus from '~icons/lucide/plus';
import IconTrash2 from '~icons/lucide/trash-2';
import IconHistory from '~icons/lucide/history';
import IconHeart from '~icons/lucide/heart';
import IconCalendarDays from '~icons/lucide/calendar-days';
import {
  getGratitudeDiaryAddressingCopy,
  type GratitudeDiaryAddressingCopyKey,
} from '@/app/lib/addressingCopy';
import type { GratitudeDiaryMood } from '@/shared/dto';
import { resolveAddressing } from '@/shared/utils/addressing';
import {
  GRATITUDE_WORKSHEET_TEMPLATE,
  type GratitudePromptCategory,
  type GratitudePromptItem,
  type GratitudeWorksheetItem,
} from '@/shared/gratitude-diary/catalog';

type EntryInputMethod = 'text' | 'voice' | 'mixed';
const MAX_WORKSHEET_ROWS = 5;
type CalendarModelValue = CalendarRootProps['modelValue'];
type CalendarPlaceholderValue = CalendarRootProps['placeholder'];
type CalendarMaxValue = CalendarRootProps['maxValue'];

// Ключи для однократной миграции данных из localStorage в БД
const LEGACY_STORAGE_KEY = 'gratitude-diary.favorite-prompts.v1';
const MIGRATION_DONE_KEY = 'gratitude-diary.favorites-migrated.v1';

function formatLocalDateToIso(date: Date): string {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeCalendarLocale(value: string | null | undefined): string {
  const normalized = String(value || 'ru')
    .trim()
    .toLowerCase();
  if (normalized.startsWith('ru')) return 'ru-RU';
  if (normalized.startsWith('en')) return 'en-US';
  return value?.trim() || 'ru-RU';
}

const { t, locale } = useI18n();
const { $api } = useNuxtApp();
const route = useRoute();
const auth = useAuthStore();
const { getFeatureAccess } = useEntitlements();
const { openPhotoSwipeFromImg } = usePhotoSwipe();
const addressing = computed(() => resolveAddressing(auth.user?.addressing));

function diaryT(key: GratitudeDiaryAddressingCopyKey): string {
  if (!locale.value.toLowerCase().startsWith('ru')) {
    return t(`GRATITUDE_DIARY.${key}`);
  }

  return getGratitudeDiaryAddressingCopy(key, addressing.value);
}

// Composable для работы с избранными промптами (API + оптимистичные обновления)
const {
  favorites,
  catalogFavoriteMap,
  setInitialFavorites,
  isPromptFavorite,
  isCustomFavoriteByDisplayId,
  toggleCatalogFavorite,
  removeFavorite,
  createCustomFavorite,
  updateCustomFavorite,
} = useGratitudeDiaryFavorites();

const activePrompt = ref<GratitudePromptItem | null>(null);
// Флаг первоначальной загрузки — пока true, скрываем секцию вопроса чтобы не было мерцания
const isPageLoading = ref(true);
// Флаг видимости блока с вопросом (пользователь может скрыть крестиком)
const isPromptVisible = ref(true);
const promptCategories = ref<GratitudePromptCategory[]>([]);
const worksheetTemplate = ref<GratitudeWorksheetItem[]>([]);
const worksheetDraft = ref<GratitudeWorksheetItem[]>([]);
const canEditWorksheet = ref(false);
const worksheetFeatureKey = ref('gratitude.worksheet.customize');
const isEditingWorksheet = ref(false);
const isSavingWorksheet = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const isPromptCatalogOpen = ref(false);
const promptSearch = ref('');
const activePromptCategoryId = ref('favorites');
const favoritePromptDraft = ref<string | null>('');
const isFavoritePromptModalOpen = ref(false);
const favoritePromptModalMode = ref<'create' | 'edit'>('create');
// targetId для режима редактирования: catalogPromptId для каталожных или String(dbId) для кастомных
const favoritePromptEditTargetId = ref<string | null>(null);
const promptListTouchStartX = ref<number | null>(null);

const entryText = ref('');
const selectedMood = ref<GratitudeDiaryMood | null>(null);
const selectedTags = ref<string[]>([]);
const tagDraft = ref('');
const isTagInputOpen = ref(false);
const isMoodOpen = ref(false);
const isWorksheetOpen = ref(false);
const isNumberedListMode = ref(false);
const selectedEntryDate = ref(formatLocalDateToIso(new Date()));
const isEntryDatePickerOpen = ref(false);
const photoPreviewUrl = ref<string | null>(null);
// Последнее сохранённое фото записи. При выборе нового файла не меняем его,
// пока запись не сохранена успешно.
const photoUploadedUrl = ref<string | null>(null);
// Ключ объекта в Object Storage — хранится отдельно от URL для независимости от CDN
const photoStorageKey = ref<string | null>(null);
// Новое фото, выбранное локально, но ещё не загруженное в storage.
const photoFile = ref<File | null>(null);
// Флаг отложенного удаления: пользователь убрал фото из UI, но сервер обновим только на save.
const isPhotoRemoved = ref(false);
const voiceWasUsed = ref(false);
// Счётчик попыток повторной загрузки фото (при 404 от CDN)
const photoLoadRetryCount = ref(0);

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const photoInputRef = ref<HTMLInputElement | null>(null);
const favoritePromptInputRef = ref<InstanceType<typeof TextareaResize> | null>(
  null
);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string>('gratitude.worksheet.customize');

// Доступ к платным функциям из entitlements (для иконок и paywall)
const worksheetAccess = computed(() =>
  getFeatureAccess(worksheetFeatureKey.value)
);
const photoAccess = computed(() => getFeatureAccess('gratitude.photo.upload'));
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);
const calendarLocale = computed(() =>
  normalizeCalendarLocale(auth.user?.locale || locale.value)
);
const calendarWeekStartsOn = computed<0 | 1>(() =>
  calendarLocale.value.startsWith('ru') ? 1 : 0
);
const maxSelectableEntryDate = computed<CalendarMaxValue>(
  () => today(getLocalTimeZone()) as unknown as CalendarMaxValue
);
const calendarPlaceholder = computed<CalendarPlaceholderValue>(
  () =>
    parseDate(selectedEntryDate.value) as unknown as CalendarPlaceholderValue
);
const calendarEntryDate = computed<CalendarModelValue>(
  () =>
    parseDate(selectedEntryDate.value) as unknown as Exclude<
      CalendarModelValue,
      unknown[]
    >
);
const entryDateFormatter = computed(
  () =>
    new DateFormatter(calendarLocale.value, {
      dateStyle: 'full',
    })
);
const selectedEntryDateLabel = computed(() =>
  entryDateFormatter.value.format(
    parseDate(selectedEntryDate.value).toDate(getLocalTimeZone())
  )
);
const isSelectedEntryDateToday = computed(
  () => selectedEntryDate.value === formatLocalDateToIso(new Date())
);

function handleCalendarEntryDateChange(value: CalendarModelValue) {
  const nextDate = Array.isArray(value) ? value[0] : value;
  if (!nextDate) return;

  const nextValue = nextDate.toString();
  const todayValue = formatLocalDateToIso(new Date());
  if (nextValue > todayValue) return;

  selectedEntryDate.value = nextValue;
  isEntryDatePickerOpen.value = false;
}

function getPlanBadgeEmoji(plan: string): string {
  return plan === 'premium' ? '💎' : '⭐';
}

// Если в query есть entryId, страница работает как редактор существующей записи.
const editEntryId = computed(() => {
  const raw = route.query.entryId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const numberId = Number(value || 0);
  return Number.isInteger(numberId) && numberId > 0 ? numberId : null;
});
const isEditMode = computed(() => Boolean(editEntryId.value));

const moods = computed(() => [
  {
    value: 'great' as const,
    emoji: '🙂',
    label: t('GRATITUDE_DIARY.MOOD_GREAT'),
  },
  {
    value: 'good' as const,
    emoji: '😊',
    label: t('GRATITUDE_DIARY.MOOD_GOOD'),
  },
  {
    value: 'okay' as const,
    emoji: '😌',
    label: t('GRATITUDE_DIARY.MOOD_OKAY'),
  },
  {
    value: 'low' as const,
    emoji: '😐',
    label: t('GRATITUDE_DIARY.MOOD_LOW'),
  },
  {
    value: 'sad' as const,
    emoji: '😔',
    label: t('GRATITUDE_DIARY.MOOD_SAD'),
  },
]);

const saveDisabled = computed(() => !entryText.value.trim() || isSaving.value);
const selectedMoodItem = computed(() => {
  if (!selectedMood.value) return null;
  return moods.value.find((item) => item.value === selectedMood.value) || null;
});
// Строим список GratitudePromptItem из DB-записей избранных.
// custom-промпты: id = String(dbId), text = customText
// catalog-промпты: берём оригинальный объект из каталога (с оригинальным id)
const favoritePrompts = computed<GratitudePromptItem[]>(() => {
  const catalogPromptsById = new Map(
    promptCategories.value
      .flatMap((category) => category.prompts)
      .map((prompt) => [prompt.id, prompt] as const)
  );

  return favorites.value.flatMap((fav) => {
    if (fav.promptType === 'custom' && fav.customText) {
      return [{ id: String(fav.id), text: fav.customText }];
    }
    if (fav.promptType === 'catalog' && fav.catalogPromptId) {
      const item = catalogPromptsById.get(fav.catalogPromptId);
      // "Мёртвые" ссылки фильтруются на уровне API, но на всякий случай
      if (item) return [item];
    }
    return [];
  });
});

const promptCategoriesWithFavorites = computed<GratitudePromptCategory[]>(
  () => [
    {
      id: 'favorites',
      title: t('GRATITUDE_DIARY.PROMPTS_FAVORITES_TAB'),
      emoji: '💗',
      prompts: favoritePrompts.value,
    },
    ...promptCategories.value,
  ]
);

const selectedPromptCategory = computed<GratitudePromptCategory | null>(() => {
  const category =
    promptCategoriesWithFavorites.value.find(
      (item) => item.id === activePromptCategoryId.value
    ) || promptCategoriesWithFavorites.value[0];
  return category || null;
});

const visiblePrompts = computed<GratitudePromptItem[]>(() => {
  const categoryPrompts = selectedPromptCategory.value?.prompts || [];
  const query = promptSearch.value.trim().toLowerCase();
  if (!query) return categoryPrompts;
  return categoryPrompts.filter((prompt) =>
    prompt.text.toLowerCase().includes(query)
  );
});

// Кнопка «Восстановить» disabled, если нет доступа или шаблон уже стандартный
const isRestoreWorksheetDisabled = computed(() => {
  if (!canEditWorksheet.value) return true;
  const draft = worksheetDraft.value;
  const standard = GRATITUDE_WORKSHEET_TEMPLATE;
  if (draft.length !== standard.length) return false;
  return draft.every(
    (item, i) =>
      item.emoji === standard[i]?.emoji && item.text === standard[i]?.text
  );
});

const {
  isListening,
  toggleListening: toggleMic,
  stopListening,
} = useVoiceDictationInput({
  getValue: () => entryText.value,
  setValue: (value) => {
    entryText.value = value.slice(0, 2000);
    voiceWasUsed.value = true;
    autoResizeTextarea();
  },
  separator: '\n',
  onStartError: () => {
    useToast(
      t('GRATITUDE_DIARY.VOICE_UNAVAILABLE'),
      diaryT('VOICE_FALLBACK'),
      'warning'
    );
  },
  onFinalTranscription: () => {
    voiceWasUsed.value = true;
  },
});

const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

function goBack() {
  void navigateTo('/practices/gratitude-diary');
}

async function deleteEntry() {
  const id = editEntryId.value;
  if (!id || isDeleting.value) return;

  isDeleting.value = true;
  try {
    await $api(`/api/gratitude-diary/entries/${id}`, { method: 'DELETE' });
    useToast(t('GRATITUDE_DIARY.DELETED'));
    await navigateTo('/practices/gratitude-diary');
  } catch (error: any) {
    useToast(
      t('GRATITUDE_DIARY.DELETE_FAILED'),
      error?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
      'error'
    );
  } finally {
    isDeleting.value = false;
  }
}

function closeFloatingPanels() {
  isMoodOpen.value = false;
  isTagInputOpen.value = false;
  isWorksheetOpen.value = false;
}

function toggleMoodPanel() {
  isMoodOpen.value = !isMoodOpen.value;
  if (isMoodOpen.value) {
    isTagInputOpen.value = false;
    isWorksheetOpen.value = false;
  }
}

function toggleTagPanel() {
  isTagInputOpen.value = !isTagInputOpen.value;
  if (isTagInputOpen.value) {
    isMoodOpen.value = false;
    isWorksheetOpen.value = false;
  }
}

function toggleWorksheetPanel() {
  if (!isWorksheetOpen.value) {
    worksheetDraft.value = worksheetTemplate.value.map((item) => ({ ...item }));
  }
  isWorksheetOpen.value = !isWorksheetOpen.value;
  if (isWorksheetOpen.value) {
    isMoodOpen.value = false;
    isTagInputOpen.value = false;
  }
}

function updateWorksheetDraftEmoji(index: number, emoji: string) {
  const current = worksheetDraft.value[index];
  if (!current) return;
  worksheetDraft.value[index] = {
    ...current,
    emoji: emoji.slice(0, 16),
  };
}

function updateWorksheetDraftText(index: number, text: string) {
  const current = worksheetDraft.value[index];
  if (!current) return;
  worksheetDraft.value[index] = {
    ...current,
    text: text.slice(0, 180),
  };
}

function startWorksheetEditing() {
  if (!canEditWorksheet.value) {
    paywallFeatureKey.value = worksheetFeatureKey.value;
    paywallOpen.value = true;
    return;
  }
  isEditingWorksheet.value = true;
  worksheetDraft.value = worksheetTemplate.value.map((item) => ({ ...item }));
  if (!worksheetDraft.value.length) {
    worksheetDraft.value = [createEmptyWorksheetRow()];
  }
}

function cancelWorksheetEditing() {
  isEditingWorksheet.value = false;
  worksheetDraft.value = worksheetTemplate.value.map((item) => ({ ...item }));
}

function restoreDefaultWorksheetDraft() {
  if (isRestoreWorksheetDisabled.value) return;

  isEditingWorksheet.value = true;
  worksheetDraft.value = GRATITUDE_WORKSHEET_TEMPLATE.map((item) => ({
    ...item,
  }));
}

function createEmptyWorksheetRow(): GratitudeWorksheetItem {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    emoji: '',
    text: '',
  };
}

function addWorksheetDraftRow() {
  if (worksheetDraft.value.length >= MAX_WORKSHEET_ROWS) {
    useToast(t('GRATITUDE_DIARY.WORKSHEET_MAX_ROWS_REACHED'), '', 'warning');
    return;
  }
  worksheetDraft.value = [...worksheetDraft.value, createEmptyWorksheetRow()];
}

function removeWorksheetDraftRow(index: number) {
  if (worksheetDraft.value.length <= 1) return;
  worksheetDraft.value = worksheetDraft.value.filter((_, i) => i !== index);
}

function toNonEmptyWorksheetRows(
  rows: GratitudeWorksheetItem[]
): GratitudeWorksheetItem[] {
  return rows
    .map((row, index) => ({
      id: String(row.id || `row-${index + 1}`)
        .trim()
        .slice(0, 60),
      emoji: String(row.emoji || '')
        .trim()
        .slice(0, 16),
      text: String(row.text || '')
        .trim()
        .slice(0, 180),
    }))
    .filter((row) => row.text.length > 0)
    .slice(0, MAX_WORKSHEET_ROWS);
}

function selectMood(mood: GratitudeDiaryMood) {
  selectedMood.value = mood;
  isMoodOpen.value = false;
}

function autoResizeTextarea() {
  const element = textareaRef.value;
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

function handleTextareaInput() {
  autoResizeTextarea();
}

function setTextareaCursor(position: number) {
  const element = textareaRef.value;
  if (!element) return;
  const safePosition = Math.max(0, Math.min(position, element.value.length));
  element.setSelectionRange(safePosition, safePosition);
}

async function focusTextareaAtEnd() {
  await nextTick();
  autoResizeTextarea();
  const element = textareaRef.value;
  if (!element) return;
  element.focus();
  setTextareaCursor(entryText.value.length);
}

function ensureNumberedListSeed() {
  const normalizedText = entryText.value.trim();

  if (!normalizedText) {
    entryText.value = '1. ';
    return;
  }

  if (!/(^|\n)\d+\.\s/.test(entryText.value)) {
    const separator = entryText.value.endsWith('\n') ? '' : '\n';
    entryText.value += `${separator}1. `;
  }
}

async function toggleNumberedListMode() {
  isNumberedListMode.value = !isNumberedListMode.value;
  if (!isNumberedListMode.value) return;

  ensureNumberedListSeed();
  await focusTextareaAtEnd();
}

function handleTextareaEnter(event: KeyboardEvent) {
  if (!isNumberedListMode.value || event.shiftKey) return;

  const element = textareaRef.value;
  if (!element) return;

  const start = element.selectionStart;
  const end = element.selectionEnd;
  const value = entryText.value;
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIndex = value.indexOf('\n', start);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const currentLine = value.slice(lineStart, lineEnd);
  const currentLineMatch = currentLine.match(/^(\d+)\.\s/);

  if (!currentLineMatch) return;

  event.preventDefault();
  const nextNumber = Number(currentLineMatch[1]) + 1;
  const insertion = `\n${nextNumber}. `;
  const nextValue = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
  entryText.value = nextValue.slice(0, 2000);

  const nextCursor = Math.min(start + insertion.length, entryText.value.length);
  void nextTick(() => {
    autoResizeTextarea();
    element.focus();
    setTextareaCursor(nextCursor);
  });
}

function selectPrompt(prompt: GratitudePromptItem) {
  activePrompt.value = prompt;
  isPromptCatalogOpen.value = false;
}

function isCustomFavoritePrompt(prompt: GratitudePromptItem): boolean {
  // Кастомные промпты имеют id = String(dbId) — числовая строка
  return isCustomFavoriteByDisplayId(prompt.id);
}

// Переключить каталожный промпт в избранном (вызов composable)
function togglePromptFavorite(prompt: GratitudePromptItem) {
  // Кастомные промпты не переключаются через эту функцию
  if (isCustomFavoritePrompt(prompt)) return;
  void toggleCatalogFavorite(prompt.id);
}

function focusFavoritePromptModalTextarea() {
  void nextTick(() => {
    const textareaElement = (favoritePromptInputRef.value as any)?.textarea
      ?.value as HTMLTextAreaElement | undefined;
    textareaElement?.focus();
  });
}

function openCreateFavoritePromptModal() {
  favoritePromptModalMode.value = 'create';
  favoritePromptEditTargetId.value = null;
  favoritePromptDraft.value = '';
  isFavoritePromptModalOpen.value = true;
  focusFavoritePromptModalTextarea();
}

function openEditFavoritePromptModal(prompt: GratitudePromptItem) {
  favoritePromptModalMode.value = 'edit';
  favoritePromptEditTargetId.value = prompt.id;
  favoritePromptDraft.value = prompt.text;
  isFavoritePromptModalOpen.value = true;
  focusFavoritePromptModalTextarea();
}

async function submitFavoritePromptModal() {
  const nextText = String(favoritePromptDraft.value || '')
    .trim()
    .slice(0, 220);
  if (!nextText) return;

  // Сразу закрываем модалку для мгновенного UX
  favoritePromptDraft.value = '';
  isFavoritePromptModalOpen.value = false;

  if (favoritePromptModalMode.value === 'create') {
    await createCustomFavorite(nextText);
  } else {
    const targetId = favoritePromptEditTargetId.value;
    if (!targetId) return;

    if (isCustomFavoriteByDisplayId(targetId)) {
      // Редактируем существующий кастомный промпт по DB id
      const dbId = Number(targetId);
      await updateCustomFavorite(dbId, nextText);
    } else {
      // При редактировании системного вопроса из избранного:
      // удаляем каталожную запись и создаём кастомную копию с новым текстом.
      const catalogFav = catalogFavoriteMap.value.get(targetId);
      if (catalogFav) await removeFavorite(catalogFav.id);
      await createCustomFavorite(nextText);
    }
  }

  favoritePromptEditTargetId.value = null;
}

async function removeFavoritePrompt(prompt: GratitudePromptItem) {
  // Определяем DB id для удаления:
  // - кастомный промпт: prompt.id = String(dbId)
  // - каталожный промпт: ищем по catalogPromptId в Map
  if (isCustomFavoritePrompt(prompt)) {
    const dbId = Number(prompt.id);
    if (!isNaN(dbId)) await removeFavorite(dbId);
  } else {
    const catalogFav = catalogFavoriteMap.value.get(prompt.id);
    if (catalogFav) await removeFavorite(catalogFav.id);
  }
}

function activatePromptCategoryByOffset(offset: -1 | 1) {
  const categories = promptCategoriesWithFavorites.value;
  const currentIndex = categories.findIndex(
    (category) => category.id === activePromptCategoryId.value
  );
  if (currentIndex < 0) return;
  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= categories.length) return;
  activePromptCategoryId.value = categories[nextIndex]?.id || 'favorites';
}

function handlePromptListTouchStart(event: TouchEvent) {
  promptListTouchStartX.value = event.changedTouches[0]?.clientX ?? null;
}

function handlePromptListTouchEnd(event: TouchEvent) {
  const startX = promptListTouchStartX.value;
  const endX = event.changedTouches[0]?.clientX ?? null;
  promptListTouchStartX.value = null;
  if (startX === null || endX === null) return;

  const delta = endX - startX;
  if (Math.abs(delta) < 48) return;
  if (delta < 0) {
    activatePromptCategoryByOffset(1);
    return;
  }
  activatePromptCategoryByOffset(-1);
}

function setRandomPrompt() {
  // Кастомные избранные добавляем в общий пул для рандомизации
  const customFavoritesAsPrompts = favorites.value
    .filter((f) => f.promptType === 'custom' && f.customText)
    .map((f) => ({ id: String(f.id), text: f.customText! }));

  const allPrompts = [
    ...promptCategories.value.flatMap((category) => category.prompts),
    ...customFavoritesAsPrompts,
  ];
  if (!allPrompts.length) return;
  const currentId = activePrompt.value?.id || '';
  const filtered = allPrompts.filter((prompt) => prompt.id !== currentId);
  const source = filtered.length ? filtered : allPrompts;
  const randomIndex = Math.floor(Math.random() * source.length);
  const nextPrompt = source[randomIndex] || null;
  if (!nextPrompt) return;
  activePrompt.value = nextPrompt;
}

async function applyWorksheetTemplate() {
  const rowsToApply = toNonEmptyWorksheetRows(worksheetDraft.value);
  const templateText = rowsToApply
    .map((item) => `${item.emoji ? `${item.emoji} ` : ''}${item.text}:`)
    .join('\n\n\n');
  if (!templateText) {
    useToast(t('GRATITUDE_DIARY.WORKSHEET_MIN_ROWS_ERROR'), '', 'warning');
    return;
  }
  const firstHeading = `${rowsToApply[0]?.emoji ? `${rowsToApply[0].emoji} ` : ''}${
    rowsToApply[0]?.text || ''
  }:`;
  const nextText = `${templateText}\n\n`;
  entryText.value = nextText;
  isWorksheetOpen.value = false;
  isEditingWorksheet.value = false;

  // Ставим каретку сразу под первым заголовком шаблона, чтобы можно было сразу писать.
  const cursorPosition = Math.min(nextText.length, firstHeading.length + 1);
  await nextTick();
  const element = textareaRef.value;
  if (!element) return;
  autoResizeTextarea();
  element.focus();
  setTextareaCursor(cursorPosition);
}

async function saveWorksheet() {
  if (isSavingWorksheet.value || !canEditWorksheet.value) return;
  isSavingWorksheet.value = true;

  try {
    const normalizedRows = toNonEmptyWorksheetRows(worksheetDraft.value);
    if (!normalizedRows.length) {
      useToast(t('GRATITUDE_DIARY.WORKSHEET_MIN_ROWS_ERROR'), '', 'warning');
      return;
    }

    const response = await $api<{ worksheet: GratitudeWorksheetItem[] }>(
      '/api/gratitude-diary/worksheet',
      {
        method: 'PUT',
        body: { worksheet: normalizedRows },
      }
    );

    worksheetTemplate.value = response.worksheet.map((item) => ({ ...item }));
    worksheetDraft.value = response.worksheet.map((item) => ({ ...item }));
    isEditingWorksheet.value = false;
    useToast(t('GRATITUDE_DIARY.WORKSHEET_SAVED'));
  } catch (error: any) {
    // Если бэкенд вернул plan-gate, показываем paywall вместо общего алерта.
    if (error?.statusCode === 402) {
      paywallFeatureKey.value = worksheetFeatureKey.value;
      paywallOpen.value = true;
      return;
    }
    useToast(
      t('GRATITUDE_DIARY.WORKSHEET_SAVE_FAILED'),
      error?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
      'error'
    );
  } finally {
    isSavingWorksheet.value = false;
  }
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
}

function addTag() {
  const nextTag = normalizeTag(tagDraft.value);
  if (!nextTag) return;
  if (selectedTags.value.includes(nextTag)) {
    tagDraft.value = '';
    return;
  }
  selectedTags.value = [...selectedTags.value, nextTag].slice(0, 10);
  tagDraft.value = '';
}

function removeTag(tag: string) {
  selectedTags.value = selectedTags.value.filter((value) => value !== tag);
}

async function loadPromptCatalog() {
  const response = await $api<{
    categories: GratitudePromptCategory[];
    worksheet: GratitudeWorksheetItem[];
    canEditWorksheet: boolean;
    worksheetFeatureKey: string;
    favoritePrompts: FavoritePromptItem[];
  }>('/api/gratitude-diary/prompts', { method: 'GET' });

  promptCategories.value = response.categories;
  worksheetTemplate.value = response.worksheet;
  worksheetDraft.value = response.worksheet.map((item) => ({ ...item }));
  canEditWorksheet.value = response.canEditWorksheet;
  worksheetFeatureKey.value = response.worksheetFeatureKey;

  // Инициализируем избранные из ответа API (уже без "мёртвых" ссылок)
  setInitialFavorites(response.favoritePrompts);

  if (!activePrompt.value) {
    activePrompt.value = response.categories[0]?.prompts[0] || null;
  }
}

// Однократная миграция данных из localStorage в БД.
// Запускается после loadPromptCatalog — только если есть старые данные и нет флага.
async function migrateFromLocalStorage() {
  if (
    typeof window === 'undefined' ||
    typeof window.localStorage === 'undefined'
  ) {
    return;
  }

  // Если миграция уже была выполнена — пропускаем
  if (window.localStorage.getItem(MIGRATION_DONE_KEY)) return;

  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!raw) {
    // Старых данных нет — сразу помечаем как мигрированные
    window.localStorage.setItem(MIGRATION_DONE_KEY, '1');
    return;
  }

  try {
    const parsed = JSON.parse(raw) as {
      catalogPromptIds?: unknown;
      customPrompts?: unknown;
    };

    const catalogPromptIds = Array.isArray(parsed.catalogPromptIds)
      ? parsed.catalogPromptIds
          .map((id) => String(id))
          .filter((id) => id.trim().length > 0)
      : [];

    const customPrompts = Array.isArray(parsed.customPrompts)
      ? parsed.customPrompts
          .map((item: any) => ({
            text: String(item?.text || '')
              .trim()
              .slice(0, 220),
          }))
          .filter((item) => item.text.length > 0)
      : [];

    if (catalogPromptIds.length === 0 && customPrompts.length === 0) {
      window.localStorage.setItem(MIGRATION_DONE_KEY, '1');
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return;
    }

    const { items } = await $api<{
      imported: number;
      items: FavoritePromptItem[];
    }>('/api/gratitude-diary/favorites/migrate', {
      method: 'POST',
      body: { catalogPromptIds, customPrompts },
    });

    // Обновляем локальное состояние мигрированными данными
    setInitialFavorites(items);

    window.localStorage.setItem(MIGRATION_DONE_KEY, '1');
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    // Ошибка миграции не критична — данные остаются в localStorage,
    // при следующем открытии попытка повторится.
    console.warn('[GratitudeDiary] Migration from localStorage failed:', error);
  }
}

async function loadEntryForEdit() {
  if (!editEntryId.value) return;
  const response = await $api<{
    item: {
      text: string;
      mood: GratitudeDiaryMood | null;
      tags: string[];
      photoUrl: string | null;
      photoStorageKey: string | null;
      promptText: string | null;
      inputMethod: EntryInputMethod;
      createdAt: string;
    };
  }>(`/api/gratitude-diary/entries/${editEntryId.value}`, { method: 'GET' });

  entryText.value = response.item.text;
  selectedMood.value = response.item.mood;
  selectedTags.value = response.item.tags;
  selectedEntryDate.value = formatLocalDateToIso(
    new Date(response.item.createdAt)
  );
  photoPreviewUrl.value = response.item.photoUrl;
  photoUploadedUrl.value = response.item.photoUrl;
  photoStorageKey.value = response.item.photoStorageKey;
  photoFile.value = null;
  isPhotoRemoved.value = false;
  photoLoadRetryCount.value = 0;
  isNumberedListMode.value = /(^|\n)\d+\.\s/.test(response.item.text);

  // Восстанавливаем вопрос, который был активен при создании записи
  if (response.item.promptText) {
    // Ищем совпадение по тексту в каталоге
    const allPrompts = promptCategories.value.flatMap((c) => c.prompts);
    const found = allPrompts.find((p) => p.text === response.item.promptText);
    // Если не нашли в каталоге — создаём синтетический объект (кастомный или удалённый вопрос)
    activePrompt.value = found ?? {
      id: '__restored__',
      text: response.item.promptText,
    };
  }
}

type PendingPhotoSaveResult = {
  photoUrl: string | null;
  photoStorageKey: string | null;
  cleanupStorageKey: string | null;
};

function getSavedPhotoPayload(): Omit<
  PendingPhotoSaveResult,
  'cleanupStorageKey'
> {
  if (isPhotoRemoved.value) {
    return {
      photoUrl: null,
      photoStorageKey: null,
    };
  }

  return {
    photoUrl: photoUploadedUrl.value ?? null,
    photoStorageKey: photoStorageKey.value ?? null,
  };
}

async function readPhotoFileAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader === 'undefined') {
    throw new Error('photo_unsupported');
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedPhotoIfNeeded(): Promise<PendingPhotoSaveResult> {
  if (!photoFile.value) {
    return {
      ...getSavedPhotoPayload(),
      cleanupStorageKey: null,
    };
  }

  const selectedPhoto = photoFile.value;
  const dataUrl = await readPhotoFileAsDataUrl(selectedPhoto);
  const base64 = dataUrl.split(',')[1] || '';

  const uploadResponse = await $api<{ url: string; storageKey: string }>(
    '/api/gratitude-diary/upload-photo',
    {
      method: 'POST',
      body: {
        fileName: selectedPhoto.name,
        mimeType: selectedPhoto.type,
        base64,
      },
    }
  );

  return {
    photoUrl: uploadResponse.url,
    photoStorageKey: uploadResponse.storageKey,
    // Если сохранение записи упадёт после upload, пробуем удалить новый объект.
    cleanupStorageKey: uploadResponse.storageKey,
  };
}

async function cleanupUploadedPhoto(storageKey: string): Promise<void> {
  try {
    await $api('/api/gratitude-diary/delete-photo', {
      method: 'POST',
      body: { storageKey },
    });
  } catch (error) {
    console.error('[GratitudeDiary] Не удалось очистить загруженное фото', {
      storageKey,
      error,
    });
  }
}

// Обработчик ошибки загрузки изображения.
// CDN может вернуть 404 на первый запрос (холодный кеш) — повторяем через 2 сек.
// Максимум 3 попытки, чтобы не уходить в бесконечный цикл.
function handlePhotoLoadError() {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  if (photoLoadRetryCount.value >= MAX_RETRIES) return;
  if (!photoPreviewUrl.value?.startsWith('http')) return;
  if (!photoUploadedUrl.value) return;
  // Повторять стоит только для CDN-URL, а не для локальных dataUrl (начинаются с "data:")
  if (!photoUploadedUrl.value.startsWith('http')) return;

  photoLoadRetryCount.value++;

  setTimeout(() => {
    if (!photoUploadedUrl.value) return;
    // Добавляем cache-buster чтобы браузер не использовал закешированный 404
    const separator = photoUploadedUrl.value.includes('?') ? '&' : '?';
    photoPreviewUrl.value = `${photoUploadedUrl.value}${separator}_r=${photoLoadRetryCount.value}`;
  }, RETRY_DELAY_MS);
}

async function handlePhotoClick() {
  if (!photoAccess.value.available) {
    paywallFeatureKey.value = 'gratitude.photo.upload';
    paywallOpen.value = true;
    return;
  }
  photoInputRef.value?.click();
}

/** Убирает фото из UI и помечает нужное состояние для следующего save. */
function removePhoto() {
  const hasSavedPhoto = Boolean(
    photoUploadedUrl.value || photoStorageKey.value
  );

  // В v2-flow удаляем фото только локально. Реальный PATCH/cleanup делается на save.
  photoPreviewUrl.value = null;
  photoFile.value = null;
  isPhotoRemoved.value = hasSavedPhoto;
  photoLoadRetryCount.value = 0;
}

async function handlePhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    useToast(t('GRATITUDE_DIARY.PHOTO_TOO_BIG'), '', 'warning');
    input.value = '';
    return;
  }

  if (typeof FileReader === 'undefined') {
    useToast(t('GRATITUDE_DIARY.PHOTO_UNSUPPORTED'), '', 'warning');
    input.value = '';
    return;
  }

  try {
    const dataUrl = await readPhotoFileAsDataUrl(file);

    // До save держим новое фото только локально.
    photoFile.value = file;
    photoPreviewUrl.value = dataUrl;
    photoLoadRetryCount.value = 0;
    isPhotoRemoved.value = false;
  } catch (error: any) {
    if (error?.message === 'photo_unsupported') {
      useToast(t('GRATITUDE_DIARY.PHOTO_UNSUPPORTED'), '', 'warning');
      return;
    }
    useToast(
      t('GRATITUDE_DIARY.PHOTO_UPLOAD_FAILED'),
      error?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
      'error'
    );
  } finally {
    input.value = '';
  }
}

async function saveEntry() {
  const textForSave = entryText.value.trim();
  if (!textForSave.trim() || isSaving.value) return;

  // Фиксируем способ ввода для аналитики/истории взаимодействий.
  const inputMethod: EntryInputMethod = voiceWasUsed.value
    ? entryText.value.trim() === textForSave.trim()
      ? 'voice'
      : 'mixed'
    : 'text';

  isSaving.value = true;
  let cleanupStorageKey: string | null = null;
  try {
    const photoPayload = await uploadSelectedPhotoIfNeeded();
    cleanupStorageKey = photoPayload.cleanupStorageKey;

    if (isEditMode.value && editEntryId.value) {
      await $api(`/api/gratitude-diary/entries/${editEntryId.value}`, {
        method: 'PATCH',
        body: {
          text: textForSave,
          mood: selectedMood.value,
          tags: selectedTags.value,
          entryDate: selectedEntryDate.value,
          photoUrl: photoPayload.photoUrl,
          photoStorageKey: photoPayload.photoStorageKey,
          inputMethod,
          // Если вопрос был скрыт крестиком — сохраняем null, иначе текущий вопрос
          promptText: isPromptVisible.value
            ? (activePrompt.value?.text ?? null)
            : null,
        },
      });
      useToast(t('GRATITUDE_DIARY.UPDATED'));
    } else {
      await $api('/api/gratitude-diary/entries', {
        method: 'POST',
        body: {
          text: textForSave,
          mood: selectedMood.value,
          tags: selectedTags.value,
          entryDate: selectedEntryDate.value,
          photoUrl: photoPayload.photoUrl,
          photoStorageKey: photoPayload.photoStorageKey,
          inputMethod,
          // Если вопрос был скрыт крестиком — сохраняем null, иначе текущий вопрос
          promptText: isPromptVisible.value
            ? (activePrompt.value?.text ?? null)
            : null,
        },
      });
      useToast(t('GRATITUDE_DIARY.SAVED'));
    }

    // После успешного сохранения запись уже ссылается на новое фото,
    // поэтому cleanup больше не нужен даже если дальнейшая навигация упадёт.
    cleanupStorageKey = null;
    photoUploadedUrl.value = photoPayload.photoUrl;
    photoStorageKey.value = photoPayload.photoStorageKey;
    photoPreviewUrl.value = photoPayload.photoUrl;
    photoFile.value = null;
    isPhotoRemoved.value = false;
    photoLoadRetryCount.value = 0;

    await navigateTo('/practices/gratitude-diary');
  } catch (error: any) {
    if (cleanupStorageKey) {
      await cleanupUploadedPhoto(cleanupStorageKey);
    }

    if (error?.statusCode === 402) {
      paywallFeatureKey.value = 'gratitude.photo.upload';
      paywallOpen.value = true;
      return;
    }

    useToast(
      t('GRATITUDE_DIARY.SAVE_FAILED'),
      error?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
      'error'
    );
  } finally {
    isSaving.value = false;
  }
}

onMounted(async () => {
  try {
    await loadPromptCatalog();
    activePromptCategoryId.value =
      promptCategoriesWithFavorites.value[0]?.id || 'favorites';
    await loadEntryForEdit();
    autoResizeTextarea();
    // Однократная миграция данных из localStorage в БД (после загрузки каталога)
    await migrateFromLocalStorage();
  } catch (error: any) {
    useToast(
      t('GRATITUDE_DIARY.LOAD_FAILED'),
      error?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
      'error'
    );
  } finally {
    // Снимаем флаг загрузки — теперь вопрос отображается с актуальным значением
    isPageLoading.value = false;
  }
});

onBeforeUnmount(() => {
  closeFloatingPanels();
  isEditingWorksheet.value = false;
  void stopListening();
});
</script>
