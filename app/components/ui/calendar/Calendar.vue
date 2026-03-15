<script setup lang="ts">
import type { CalendarRootEmits, CalendarRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
  useForwardPropsEmits,
} from 'reka-ui';
import { computed } from 'vue';
import { cn } from '@/app/lib/utils';
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconChevronRight from '~icons/lucide/chevron-right';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<
    CalendarRootProps & {
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    fixedWeeks: true,
    weekdayFormat: 'short',
  }
);

const emits = defineEmits<CalendarRootEmits>();

const delegatedProps = computed(() => {
  const delegated = { ...props };
  delete delegated.class;
  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    v-bind="{ ...forwarded, ...$attrs }"
    :class="
      cn(
        'rounded-[26px] border border-white/10 bg-black/10 p-3 text-foreground',
        props.class
      )
    "
  >
    <CalendarHeader class="mb-3 flex items-center justify-between gap-2">
      <CalendarPrev
        class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground/75 transition hover:border-white/25 hover:bg-white/10 hover:text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35"
      >
        <IconChevronLeft class="h-4 w-4" />
      </CalendarPrev>

      <CalendarHeading
        class="text-sm font-semibold tracking-[0.02em] text-foreground"
      />

      <CalendarNext
        class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-foreground/75 transition hover:border-white/25 hover:bg-white/10 hover:text-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35"
      >
        <IconChevronRight class="h-4 w-4" />
      </CalendarNext>
    </CalendarHeader>

    <div class="space-y-3">
      <CalendarGrid
        v-for="month in grid"
        :key="month.value.toString()"
        class="w-full border-collapse select-none"
      >
        <CalendarGridHead>
          <CalendarGridRow>
            <CalendarHeadCell
              v-for="day in weekDays"
              :key="day"
              class="h-8 w-10 px-0 text-center text-[11px] font-medium uppercase tracking-wide text-foreground/42"
            >
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>

        <CalendarGridBody>
          <CalendarGridRow
            v-for="(weekDates, weekIndex) in month.rows"
            :key="`${month.value.toString()}-${weekIndex}`"
          >
            <CalendarCell
              v-for="date in weekDates"
              :key="date.toString()"
              :date="date"
              class="h-10 w-10 p-0 text-center align-middle"
            >
              <CalendarCellTrigger
                :day="date"
                :month="month.value"
                class="mx-auto flex h-9 w-9 items-center justify-center rounded-2xl border border-transparent text-sm font-semibold text-foreground/88 transition outline-none hover:border-white/15 hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[today]:border-white/18 data-[today]:bg-white/4 data-[outside-view]:text-foreground/25 data-[disabled]:pointer-events-none data-[disabled]:opacity-20 data-[selected=true]:border-white/35 data-[selected=true]:bg-white/85 data-[selected=true]:text-black"
              />
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>
