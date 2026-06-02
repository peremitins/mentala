Техническое задание: анимация роста растения в retention-петле Mentala

1. Контекст

В приложении Mentala реализуется retention-механика, где пользователь каждый день видит понятный следующий шаг, выполняет действие, получает капли и наблюдает визуальный рост растения. Общая retention-петля уже описана в документе: открыть приложение, отметить состояние, сделать шаг программы или практику, получить капли, увидеть рост растения, сохранить «Мысль дня» и вернуться завтра. ￼

Текущий рабочий scope уже включает:

- главную;
- «Карту пути»;
- капли;
- растение;
- «Мысль дня»;
- streak;
- push;
- статус реализации. ￼

Данное техническое задание уточняет только часть, связанную с растением, каплями и success-анимацией роста.

⸻

2. Цель задачи

Сделать визуально приятную, реалистичную и управляемую анимацию роста растения, которая:

1. Показывает прогресс пользователя по программе.
2. Усиливает ощущение награды после завершения шага.
3. Не создает давления, вины или страха потерять прогресс.
4. Работает стабильно на Web, PWA, Android и iOS через Capacitor.
5. Не перегружает приложение тяжелой графикой.
6. Позволяет в будущем заменить CSS-эффекты на Lottie без переписывания бизнес-логики.

⸻

3. Решение P1

3.1. Основной подход

Используем гибридную схему:

Элемент Технология
Само растение 16 реалистичных WebP изображений
Переход между стадиями CSS crossfade
Увеличение растения CSS transform: scale()
Подсветка CSS radial-gradient, filter, box-shadow
Капли воды CSS-анимированные элементы
Частицы успеха CSS-анимированные элементы
Fullscreen flyout position: fixed overlay
Открытие крупной картинки существующий PhotoSwipe-механизм
Haptic feedback @capacitor/haptics, если доступен

3.2. Почему не Lottie в P1

Lottie в P1 не используем, потому что:

- нужен отдельный пайплайн подготовки .json или .lottie;
- реалистичный цветок все равно остается растровым изображением;
- CSS проще контролировать из Vue;
- CSS легче адаптировать под prefers-reduced-motion;
- CSS не добавляет новую зависимость;
- CSS проще отлаживать на WebView в Capacitor.

Решение: в P1 делаем CSS-анимации. Lottie не добавляем в зависимости проекта.

⸻

4. Визуальная концепция

4.1. Растение

Используется один реалистичный цветок:

- вид: фаленопсис, орхидея;
- финальная композиция: 3 цветоноса;
- палитра:
  - левый цветонос: насыщенный, но мягкий rose pink;
  - центральный цветонос: pale blush, white-pink;
  - правый цветонос: light pink-lavender;
- горшок: реалистичный терракотовый;
- стиль: фотореалистичный, premium botanical product style;
- фон: прозрачный или аккуратно вырезанный объект без фона.

  4.2. Анимационный стиль

Анимация должна быть:

- мягкой;
- медитативной;
- не игровой в стиле казино;
- без резких вспышек;
- без агрессивных конфетти;
- без постоянного idle-движения.

Пользователь должен ощущать:
«я сделал шаг, растение стало чуть живее», а не «мне показали игровой автомат».

⸻

5. Ассеты

5.1. Основные изображения растения

Папка:

public/retention/plant/states

Формат файлов (15 стадий, без отдельных кадров семени/проростка — см.
retention_redesign.md «Растение»):

plant-01.webp ← стартовая стадия (молодое растение с зелёными листьями)
plant-02.webp
plant-03.webp
plant-04.webp
plant-05.webp
plant-06.webp
plant-07.webp
plant-08.webp
plant-09.webp
plant-10.webp
plant-11.webp
plant-12.webp
plant-13.webp
plant-14.webp
plant-15.webp ← финальное цветение

5.2. Требования к изображениям

Параметр Требование
Формат WebP
Размер исходника 1024x1024
Размер для production 768x768 или 512x512
Соотношение 1:1
Фон прозрачный
Объект центрирован
Позиция горшка одинаковая во всех стадиях
Масштаб растения плавно увеличивается
Цветовая температура одинаковая
Свет одинаковый
Тень либо отсутствует, либо одинаковая
Вес одного файла желательно до 250-350 KB

6. Логика стадий растения

6.1. Количество стадий

Всего: **15 стадий**. Семя и проросток как отдельные кадры исключены —
plant-01.webp уже показывает молодое растение с зелёными листьями.

6.2. Привязка к завершенным шагам программы

Пороги не хардкодятся под 21/23/30 шагов. `app/utils/retentionPlant.ts`
делит фактическое `program.totalSteps` на 15 стадий и считает порог каждой
стадии формулой:

```ts
threshold = Math.ceil((totalSteps * stageIndex) / 15)
```

Для 30 шагов это даёт примерную смену каждые 2 шага:

Завершенные шаги Стадия Файл
0-1 1 plant-01.webp ← зелёные листья
2-3 2 plant-02.webp
4-5 3 plant-03.webp
6-7 4 plant-04.webp
8-9 5 plant-05.webp
10-11 6 plant-06.webp
12-13 7 plant-07.webp
14-15 8 plant-08.webp
16-17 9 plant-09.webp
18-19 10 plant-10.webp
20-21 11 plant-11.webp
22-23 12 plant-12.webp
24-25 13 plant-13.webp
26-29 14 plant-14.webp
30 15 plant-15.webp ← финал

6.3. Функция расчета стадии

Реализована в `app/utils/retentionPlant.ts:getRetentionPlantStateIndex`.
Возвращает 0-based индекс (0..14), фронт прибавляет 1 для номера файла.

Эквивалентная человеко-читаемая логика:

```ts
export function getPlantStageByCompletedSteps(
  completedSteps: number,
  totalSteps: number
): number {
  return getRetentionPlantStateIndex(completedSteps, totalSteps) + 1
}
```

⸻

7. Когда запускать анимацию

7.1. Завершение шага программы

При успешном вызове:

POST /api/program-step-attempts/:attemptId/complete

Если шаг завершен впервые:

1. Начисляются капли.
2. Обновляется progress.
3. Рассчитывается новая стадия растения.
4. Запускается success-анимация.

Если шаг повторный:

1. Основная награда повторно не начисляется.
2. Растение не переходит в новую стадию.
3. Можно показать короткую спокойную анимацию без fullscreen flyout.

7.2. Mood check-in

При первом mood check-in дня:

1. Начисляется 1 капля.
2. Запускается короткая анимация капель в карточке растения.
3. Fullscreen flyout не запускается.
4. Стадия растения не меняется, если не изменился прогресс программы.

7.3. Сохранение «Мысли дня»

При первом сохранении мысли:

1. Начисляется 1 капля.
2. Запускается короткая анимация капель.
3. Fullscreen flyout не запускается.
4. Стадия растения не меняется.

⸻

8. Типы анимаций

8.1. Inline-анимация капель

Используется на главной в карточке растения.

Когда запускать

- mood check-in;
- сохранение «Мысли дня»;
- свободная практика, если она в будущем будет начислять капли;
- завершение шага до fullscreen-анимации.

Поведение

1. 3-7 капель падают сверху на растение.
2. Капли имеют разные задержки.
3. Капли слегка смещаются по горизонтали.
4. После падения появляется мягкое свечение.
5. Длительность: 900-1400 ms.

CSS-эффекты

- transform: translate3d();
- opacity;
- scale;
- radial-gradient;
- blur.

⸻

8.2. Crossfade между стадиями

Когда запускать

Только если стадия растения изменилась.

Поведение

1. Старая стадия остается видимой.
2. Новая стадия появляется поверх старой.
3. Новая стадия плавно увеличивает opacity от 0 до 1.
4. Старая стадия плавно уменьшается до 0.
5. Новая стадия слегка увеличивается через scale(0.985) -> scale(1).
6. В момент перехода добавляется мягкий glow.

Длительность

700-1000 ms

⸻

8.3. Fullscreen success-анимация

Когда запускать

Только после первого успешного завершения шага программы, если шаг двигает пользователя вперед.

Общая длительность

8000-10000 ms

Сценарий

1. Пользователь нажимает завершение шага.
2. Карточка растения на главной получает координаты через getBoundingClientRect().
3. Создается fixed overlay поверх интерфейса.
4. В overlay помещается копия растения.
5. Копия стартует из координат карточки.
6. Копия плавно увеличивается почти до fullscreen.
7. Появляются капли.
8. Появляется glow.
9. Если стадия изменилась, старая картинка crossfade-переходом растворяется в новую.
10. Новая стадия удерживается крупно 2-3 секунды.
11. Появляются легкие частицы успеха.
12. Копия растения плавно возвращается в карточку.
13. Overlay удаляется.
14. Основная карточка уже показывает новую стадию.

Timeline

Время Действие
0-300 ms подготовка overlay, затемнение фона
300-1200 ms растение вылетает из карточки и увеличивается
0-2600 ms три soft-confetti залпа как отдельная success-прелюдия: старт, +100 ms, +200 ms
2600-5000 ms растение вылетает из карточки и увеличивается
5600-6800 ms капли поливают растение и попадают в область горшка/корней
6900-9000 ms crossfade старой стадии в новую
9000-11600 ms новая стадия удерживается крупно, допустимы лёгкие soft particles
11600-13600 ms растение возвращается в карточку, cleanup, unlock UI

Ограничения

- Overlay не должен блокировать системную навигацию дольше 13-14 секунд вместе с prelude-анимацией.
- Должна быть возможность закрыть анимацию тапом по overlay или кнопкой «Пропустить».
- При закрытии анимации состояние растения должно быть уже обновлено.
- Повторный запуск анимации во время активной анимации запрещен.

⸻

8.4. Частицы успеха

Визуал

Небольшие мягкие частицы:

- светло-розовые;
- светло-голубые;
- белые;
- прозрачные;
- без агрессивного конфетти.

Поведение

- появляются вокруг растения;
- слегка поднимаются вверх;
- исчезают через opacity;
- длительность: 900-1400 ms.

⸻

8.5. Glow

Визуал

Мягкое свечение вокруг листьев и цветов:

radial-gradient(circle, rgba(255, 219, 235, 0.45), rgba(255, 219, 235, 0) 70%)

Поведение

- появляется после падения капель;
- усиливается в момент перехода стадии;
- исчезает после завершения success-анимации.

⸻

9. UX-правила

9.1. Никакого давления

Запрещено:

- показывать увядание растения;
- делать растение серым из-за пропуска;
- писать «не потеряй прогресс»;
- обнулять визуальный рост;
- использовать тревожные push-тексты.

  9.2. Нет постоянной idle-анимации

На главной растение статично.

Разрешены только:

- анимация после действия;
- смена стадии;
- открытие fullscreen preview;
- легкий hover/tap feedback.

  9.3. Повторное завершение шага

Если пользователь повторяет уже завершенный шаг:

- не начислять energyReward повторно;
- не двигать растение вперед;
- не запускать fullscreen success;
- можно показать короткий inline glow.

  9.4. Reduced motion

Если включен prefers-reduced-motion: reduce:

- отключить fullscreen flyout;
- отключить частицы;
- отключить падающие капли;
- оставить только мгновенную смену картинки или короткий fade до 200 ms;
- не использовать scale-анимации.

⸻

10. Компоненты

10.1. HomeEnergyPlantCard.vue

Карточка на главной.

Ответственность

- показывает текущее растение;
- показывает недельные капли;
- показывает цель недели;
- открывает PhotoSwipe;
- запускает inline-анимацию капель;
- передает координаты карточки для fullscreen-анимации.

Фактическая P1-интеграция в кодовой базе

- компонент: `app/components/home/HomeEnergyPlantCard.vue`;
- данные: `energy` и `program` из `GET /api/today`;
- inline-полив запускается через `waterSignal` и `waterIntensity`;
- крупное открытие изображения идёт через общий `usePhotoSwipe`.

Props

type HomeEnergyPlantCardProps = {
energy: TodayResponseDto['energy']
program: ProgramOverviewDto
waterSignal?: number
waterIntensity?: 'small' | 'medium' | 'large'
}

⸻

10.2. PlantStageImage.vue

Изолированный компонент картинки растения.

Ответственность

- выбирает правильную картинку;
- поддерживает crossfade;
- предзагружает следующую стадию.

Props

type PlantStageImageProps = {
stage: number
previousStage?: number | null
animate?: boolean
size?: 'card' | 'fullscreen'
}

Логика

- если previousStage есть и отличается от stage, отрисовываются две картинки;
- старая картинка уходит через opacity;
- новая появляется через opacity + scale;
- после завершения transition старая картинка удаляется.

⸻

10.3. PlantWaterEffect.vue

CSS-капли.

Ответственность

- рисует падающие капли;
- не знает бизнес-логики;
- запускается через prop active.

Props

type PlantWaterEffectProps = {
active: boolean
intensity?: 'small' | 'medium' | 'large'
}

Интенсивность

Значение Капли Где использовать
small 3 save thought
medium 5 mood check-in
large 7 complete step

⸻

10.4. PlantGlowEffect.vue

CSS-подсветка.

Props

type PlantGlowEffectProps = {
active: boolean
mode?: 'soft' | 'success'
}

⸻

10.5. PlantParticlesEffect.vue

Частицы успеха.

Props

type PlantParticlesEffectProps = {
active: boolean
count?: number
}

Значения:

- default: 12;
- максимум: 24;
- для слабых устройств: 0.

⸻

10.6. PlantFullscreenCelebration.vue

Главная fullscreen-анимация.

В P1 этот слой реализован внутри `ProgramStepPlantReward.vue`, потому что сейчас fullscreen-награда запускается только на success-экране roadmap-шага. Если анимация понадобится из нескольких мест, её нужно вынести в отдельный `PlantFullscreenCelebration.vue` без изменения бизнес-логики.

Ответственность

- получает старую и новую стадию;
- получает стартовые координаты карточки;
- показывает fixed overlay;
- запускает timeline;
- блокирует повторный запуск;
- дает возможность пропустить;
- вызывает onDone.

Props

type PlantFullscreenCelebrationProps = {
active: boolean
fromRect: DOMRect | null
previousStage: number
nextStage: number
durationMs?: number
}

Emits

type PlantFullscreenCelebrationEmits = {
done: []
skipped: []
}

⸻

11. Composables

11.1. usePlantStage.ts

export function usePlantStage(completedSteps: Ref<number>) {
const stage = computed(() => getPlantStageByCompletedSteps(completedSteps.value))
return {
stage,
}
}

⸻

11.2. usePlantAssets.ts

const PLANT_STATES_COUNT = 16
export function getPlantImageSrc(stage: number): string {
const normalizedStage = Math.min(Math.max(stage, 1), PLANT_STATES_COUNT)
const fileNumber = String(normalizedStage).padStart(2, '0')
return `/retention/plant/states/plant-${fileNumber}.webp`
}

⸻

11.3. usePlantCelebration.ts

type PlantCelebrationState = {
isActive: Ref<boolean>
fromRect: Ref<DOMRect | null>
previousStage: Ref<number>
nextStage: Ref<number>
start: (payload: StartPlantCelebrationPayload) => void
finish: () => void
skip: () => void
}
type StartPlantCelebrationPayload = {
fromRect: DOMRect
previousStage: number
nextStage: number
}

⸻

12. Интеграция с данными

12.1. GET /api/today

Endpoint должен отдавать данные, достаточные для главной:

type TodayResponse = {
program: {
slug: string
completedSteps: number
currentStep: number
}
energy: {
weeklyDrops: number
weeklyGoal: number
}
mood: {
todayMood: string | null
checkedInToday: boolean
}
thoughtOfTheDay: {
id: string
text: string
saved: boolean
}
}

12.2. После завершения шага

После успешного complete endpoint должен вернуть:

type CompleteProgramStepResponse = {
completedStepsBefore: number
completedStepsAfter: number
energyReward: number
wasFirstCompletion: boolean
plantStageBefore: number
plantStageAfter: number
}

Если backend не готов отдавать plantStageBefore и plantStageAfter, frontend рассчитывает их самостоятельно через completedStepsBefore и completedStepsAfter.

⸻

13. Порядок выполнения на frontend

Шаг 1. Подготовить ассеты

1. Положить 16 WebP файлов в:

public/retention/plant/states

2. Проверить имена.
3. Проверить одинаковый размер.
4. Проверить одинаковое позиционирование горшка.

⸻

Шаг 2. Реализовать asset helpers

Файл:

app/shared/retention/plant/getPlantImageSrc.ts

Содержимое:

- getPlantImageSrc;
- getPlantStageByCompletedSteps.

⸻

Шаг 3. Реализовать PlantStageImage.vue

Компонент должен:

- принимать stage;
- уметь показывать fallback;
- поддерживать crossfade;
- не дублировать бизнес-логику.

⸻

Шаг 4. Реализовать CSS-эффекты

Компоненты:

PlantWaterEffect.vue
PlantGlowEffect.vue
PlantParticlesEffect.vue

⸻

Шаг 5. Реализовать fullscreen overlay

Фактический P1-компонент:

`ProgramStepPlantReward.vue`

Будущее выделение:

`PlantFullscreenCelebration.vue`, если fullscreen-анимация понадобится не только на success-экране roadmap.

Особенности:

- Teleport to="body";
- position: fixed;
- расчет стартовой позиции через DOMRect;
- блокировка scroll на время анимации;
- cleanup после завершения;
- skip по кнопке.

⸻

Шаг 6. Интегрировать с главной

В `HomeEnergyPlantCard.vue`:

- показывать текущую стадию;
- показывать недельные капли;
- запускать inline-капли;
- открывать PhotoSwipe-preview.

⸻

Шаг 7. Интегрировать с завершением шага

В step runner:

1. До запроса сохранить previousCompletedSteps.
2. Выполнить complete request.
3. Получить completedStepsAfter.
4. Рассчитать previousStage.
5. Рассчитать nextStage.
6. Если wasFirstCompletion === true, перейти на главную или показать celebration поверх текущего экрана.
7. Запустить fullscreen celebration.
8. После завершения обновить данные today.

⸻

14. Пример логики запуска после complete

async function completeCurrentStep(): Promise<void> {
const previousCompletedSteps = today.value.program.completedSteps
const previousStage = getPlantStageByCompletedSteps(previousCompletedSteps)
const response = await completeProgramStepAttempt(attemptId.value)
const nextCompletedSteps = response.completedStepsAfter
const nextStage = getPlantStageByCompletedSteps(nextCompletedSteps)
await refreshToday()
if (!response.wasFirstCompletion) {
showSmallPlantGlow()
return
}
const cardRect = plantCardRef.value?.getBoundingClientRect()
if (!cardRect) {
showInlinePlantTransition(previousStage, nextStage)
return
}
startPlantCelebration({
fromRect: cardRect,
previousStage,
nextStage,
})
}

⸻

15. CSS-технические требования

15.1. Производительность

Использовать только дешевые для браузера свойства:

Разрешено:

transform
opacity
filter

Осторожно:

box-shadow
backdrop-filter
blur

Запрещено в активной анимации:

width
height
top
left
margin
padding

Позиции рассчитывать до анимации, а затем двигать через transform.

⸻

16. Адаптивность

16.1. Размеры растения

Экран Карточка
до 360px 220-240px
360-430px 260-300px
430px+ 300-340px
tablet 340-420px

16.2. Fullscreen размер

Экран Максимальный размер растения
mobile min(86vw, 560px)
tablet min(70vw, 640px)
desktop min(520px, 60vh)

⸻

17. Accessibility

Требования:

- у картинки растения должен быть осмысленный alt;
- декоративные капли, glow и particles должны иметь aria-hidden="true";
- кнопка пропуска fullscreen-анимации должна быть доступна с клавиатуры;
- overlay должен закрываться через Escape;
- при prefers-reduced-motion анимация должна быть сокращена;
- не использовать текст, который давит на пользователя.

Пример alt:

Орхидея Mentala, стадия 7 из 16

⸻

18. Haptic feedback

На мобильных устройствах после завершения шага:

- при начислении капель: легкий haptic;
- при смене стадии: medium haptic;
- при завершении программы: success haptic, если доступно.

Псевдологика:

async function triggerPlantHaptic(type: 'small' | 'stage' | 'success'): Promise<void> {
if (!isNativePlatform()) return
if (type === 'small') {
await Haptics.impact({ style: ImpactStyle.Light })
return
}
if (type === 'stage') {
await Haptics.impact({ style: ImpactStyle.Medium })
return
}
await Haptics.notification({ type: NotificationType.Success })
}

⸻

19. Ошибки и edge cases

19.1. Изображение не загрузилось

Поведение:

1. Показать нейтральный placeholder внутри карточки растения.
2. Не ломать карточку.
3. Не запускать fullscreen celebration, если нет изображения текущей стадии.
4. Записать warning в Sentry.

⸻

19.2. Пользователь быстро завершил несколько действий

Поведение:

- если идет fullscreen celebration, новые анимации ставятся в очередь или игнорируются;
- состояние данных обновляется сразу;
- визуально показывается только последнее актуальное состояние.

Рекомендация P1:

Не делать очередь. Если анимация уже активна, обновить состояние, но не запускать новую fullscreen-анимацию.

⸻

19.3. Пользователь ушел со страницы

Поведение:

- overlay закрывается;
- таймеры очищаются;
- scroll unlock выполняется обязательно;
- состояние растения остается обновленным.

⸻

19.4. Пользователь включил reduced motion

Поведение:

- без fullscreen;
- без капель;
- без частиц;
- только fade или мгновенная смена.

⸻

20. Аналитика

События:

type PlantAnalyticsEvent =
| 'plant_card_viewed'
| 'plant_inline_water_started'
| 'plant_stage_changed'
| 'plant_fullscreen_started'
| 'plant_fullscreen_completed'
| 'plant_fullscreen_skipped'
| 'plant_preview_opened'

Payload:

type PlantAnalyticsPayload = {
programSlug: string
completedSteps: number
previousStage: number
nextStage: number
weeklyDrops: number
source: 'mood_checkin' | 'thought_save' | 'program_step_complete' | 'free_practice'
}

⸻

21. Sentry

Логировать warning:

- не загрузился production image;
- отсутствует файл стадии;
- ошибка при PhotoSwipe preview;
- ошибка в fullscreen cleanup;
- невозможно получить DOMRect.

Не логировать как error:

- пользователь пропустил анимацию;
- reduced motion отключил эффекты;

⸻

22. Acceptance criteria

22.1. Основной сценарий

Сценарий:

1. Пользователь завершает новый шаг.
2. Backend возвращает успешный complete.
3. Frontend обновляет completed steps.
4. Растение получает новую стадию.
5. Запускается fullscreen success-анимация.
6. Видны капли.
7. Старая стадия плавно переходит в новую.
8. Новая стадия удерживается крупно 2-3 секунды.
9. Растение возвращается в карточку.
10. Карточка показывает новую стадию.

Критерий: сценарий выполняется без перезагрузки страницы и без дергания интерфейса.

⸻

22.2. Mood check-in

Сценарий:

1. Пользователь отмечает mood.
2. Начисляется 1 капля.
3. В карточке растения видна короткая анимация капель.
4. Fullscreen-анимация не запускается.

⸻

22.3. Сохранение «Мысли дня»

Сценарий:

1. Пользователь сохраняет «Мысль дня».
2. Начисляется 1 капля.
3. В карточке растения видна короткая анимация капель.
4. Повторное сохранение не начисляет капли повторно.

⸻

22.4. Reduced motion

Сценарий:

1. В системе включен reduced motion.
2. Пользователь завершает шаг.
3. Fullscreen-анимация не запускается.
4. Стадия меняется без активного движения.
5. Приложение остается полностью функциональным.

⸻

22.5. Ошибка загрузки картинки

Сценарий:

1. Файл plant-08.webp отсутствует.
2. UI показывает нейтральный placeholder внутри карточки растения.
3. Карточка не ломается.
4. Ошибка записывается в Sentry как warning.

⸻

23. Что не входит в P1

Не делаем:

- 3D-модель растения;
- WebGL;
- видео-переходы;
- MP4/WebM growth sequence;
- Lottie для самого растения;
- mood-варианты растения;
- увядание растения;
- магазин за капли;
- покупку функций за капли;
- отдельный экран «Мой росток»;
- бейджи;
- сложную очередь анимаций;
- серверную генерацию картинок;
- динамическое выращивание отдельных лепестков.

⸻

24. Итоговое решение

В P1 реализуем:

1. 16 реалистичных WebP-состояний орхидеи.
2. CSS-анимацию капель.
3. CSS glow.
4. CSS particles.
5. Crossfade между стадиями.
6. Fullscreen flyout-анимацию после завершения шага.
7. PhotoSwipe preview.
8. Reduced motion.
9. Sentry warning для проблем с ассетами.

Это дает хороший «вау-эффект» без лишнего усложнения архитектуры. Реалистичное растение остается растровым ассетом, а CSS отвечает за управляемые эффекты: воду, свечение, частицы и переходы между стадиями.
