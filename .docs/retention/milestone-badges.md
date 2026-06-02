Общая идея Milestone-бейджей

Для Mentala бейджи должны быть не про "достижения любой ценой", а про мягкое признание регулярности, заботы о себе и завершённых этапов.

Mentala позиционируется как приложение для психологической самопомощи, ежедневного сопровождения, привычек и мягкой поддержки, поэтому визуальный язык бейджей должен быть спокойным, тёплым и не соревновательным.

Главный принцип:

Бейдж — это не награда за идеальность, а отметка: "ты сделал важный маленький шаг".

⸻

0. Технические характеристики бейджей

Бейдж должен быть отдельным графическим ассетом, пригодным для отображения в карточке, модальном окне celebration и на экране "Знаки пути".

Базовые требования:

- соотношение сторон: 1:1;
- исходное разрешение: 1024 × 1024 px;
- минимальное рабочее разрешение: 512 × 512 px;
- рекомендуемый экспорт для приложения: WebP;
- резервный формат: PNG с прозрачностью;
- фон: прозрачный, если бейдж используется как отдельная иконка поверх интерфейса;
- фон: мягкий нейтральный градиент допустим только для промо-превью или общего concept-art холста;
- безопасная зона: основной объект должен занимать 70–82% ширины бейджа;
- отступ от края: не меньше 8–10% от размера холста;
- текст внутри изображения не использовать — название и описание выводятся интерфейсом;
- стиль всех бейджей должен быть единым: мягкий 3D, glassmorphism, пастельная палитра, мягкое внутреннее свечение;
- не использовать кубки, медали, лавровые венки, огонь, молнии, жёсткие соревновательные символы.

Для генерации и хранения ассетов:

- master-файл: PNG 1024 × 1024 px с прозрачностью;
- production-файл: WebP 1024 × 1024 px;
- lightweight-файл для списков: WebP 512 × 512 px;
- naming: badge\_[badge_id].webp;
- пример: badge_first_step.webp.

Для concept-art превью можно собирать несколько бейджей на одном холсте, но в production каждый бейдж должен быть отдельным файлом.

⸻

0. Технические характеристики бейджей

Бейдж должен быть отдельным графическим ассетом, пригодным для отображения в карточке, модальном окне celebration и на экране "Мои вехи".

Базовые требования:

- соотношение сторон: 1:1;
- исходное разрешение: 1024 × 1024 px;
- минимальное рабочее разрешение: 512 × 512 px;
- рекомендуемый экспорт для приложения: WebP;
- резервный формат: PNG с прозрачностью;
- фон: прозрачный, если бейдж используется как отдельная иконка поверх интерфейса;
- фон: мягкий нейтральный градиент допустим только для промо-превью или общего concept-art холста;
- безопасная зона: основной объект должен занимать 70–82% ширины бейджа;
- отступ от края: не меньше 8–10% от размера холста;
- текст внутри изображения не использовать — название и описание выводятся интерфейсом;
- стиль всех бейджей должен быть единым: мягкий 3D, glassmorphism, пастельная палитра, мягкое внутреннее свечение;
- не использовать кубки, медали, лавровые венки, огонь, молнии, жёсткие соревновательные символы.

Хранение ассетов

Все файлы бейджей кладутся в: public/images/badges/

Naming:

badge_[badge_id].webp

Примеры:

public/images/badges/badge_first_step.webp
public/images/badges/badge_first_thought_saved.webp
public/images/badges/badge_first_week.webp
public/images/badges/badge_thirty_active_days.webp
public/images/badges/badge_hundred_active_days.webp
public/images/badges/badge_returned_after_pause.webp
public/images/badges/badge_garden_anxiety.webp
public/images/badges/badge_garden_sleep.webp
public/images/badges/badge_garden_[slug].webp  — для каждого нового сада

Для concept-art превью можно собирать несколько бейджей на одном холсте, но в production каждый бейдж должен быть отдельным файлом.

⸻

1. Визуальный стиль бейджей

Базовый стиль

Не делаем классические медали, кубки и лавровые венки. Это слишком спортивно и давяще.

Лучше стиль:

- мягкие круглые или скруглённые бейджи;
- стеклянная карточка, похожая на текущий glassmorphism Mentala;
- лёгкий внутренний glow;
- botanical-символика: лист, капля, росток, цветок, сад;
- спокойные пастельные цвета;
- без агрессивного золота, огня, молний и "победных" элементов.

Форма

Лучший вариант:

Круглый бейдж + мягкое внутреннее изображение + маленький символ прогресса

Например:

- круглая основа;
- внутри маленькая иллюстрация;
- внизу короткая подпись;
- вокруг тонкое светящееся кольцо.

⸻

2. Основные Milestone-бейджи для первого релиза

Итоговый набор — 7 универсальных бейджей + отдельная коллекция бейджей садов (по одному на каждую программу).

| Бейдж                 | Когда выдаётся                      | Смысл                             |
| --------------------- | ----------------------------------- | --------------------------------- |
| Первый шаг            | Завершён первый шаг любой программы | Пользователь начал путь           |
| Первая неделя         | 7 дней активности                   | Формируется ритм                  |
| 30 дней рядом с собой | 30 активных дней                    | Устойчивая практика               |
| 100 дней заботы       | 100 активных дней                   | Долгая забота о себе              |
| Первая опора          | Сохранена первая «Мысль дня»        | Пользователь начал собирать опоры |
| Ты вернулся           | Активность после перерыва           | Без стыда, пользователь вернулся  |
| [Название сада]       | Завершён конкретный сад             | Уникальный бейдж каждого сада     |

Почему убран "Маршрут начался":

Выбор программы — это нажатие кнопки, а не действие. Бейдж за пассивный выбор обесценивает систему и создаёт ложное ощущение начала вместо того, чтобы мотивировать первый реальный шаг. "Первый шаг" (завершён первый шаг программы) — достаточный и честный триггер для старта.

⸻

3. Конкретные бейджи, названия, тексты и визуальные идеи

1. Первый шаг

Название

Первый шаг

Текст

Ты начал путь. Маленькое действие уже считается.

Визуал

Маленький зелёный росток в мягком круглом бейдже. Внизу одна капля. Фон тёплый, светло-зелёный.

Промпт

A soft rounded milestone badge icon for a mental self-help mobile app.
Theme: first step on a personal growth journey.
Center: a small fresh green sprout with two leaves emerging from calm soil, one small water drop beside it.
Style: warm minimal 3D illustration, glassmorphism, soft pastel colors, gentle inner glow, rounded circular badge, subtle depth, no text, no numbers, no trophy, no medal, no aggressive gamification.
Mood: supportive, calm, kind, emotionally safe.
Background: transparent or very soft neutral gradient.
High quality mobile app icon, 1:1 aspect ratio.

⸻

2. Первая неделя

Название

Первая неделя

Текст

Семь дней заботы. Не идеально, а достаточно.

Визуал

Семь маленьких капель вокруг ростка или семь светлых точек по окружности.

Промпт

A gentle milestone badge icon for a mental wellness and self-help app.
Theme: first week of regular practice.
Center: a small healthy plant with several leaves, surrounded by seven tiny glowing water drops arranged in a soft circle.
Style: warm minimal 3D, glassmorphism, pastel green and blue palette, soft shadows, calm rounded circular badge, subtle luminous ring.
No text, no numbers, no trophy, no medal, no competitive elements.
The badge should feel emotionally safe, kind, and encouraging.
1:1 aspect ratio, mobile app quality.

⸻

3. 30 дней рядом с собой

Название

30 дней рядом с собой

Текст

Ты возвращался к себе снова и снова. Это уже опора.

Визуал

Крепкое растение с несколькими листьями и мягким светящимся кругом позади.

Промпт

A calm milestone badge icon for a psychological self-help mobile app.
Theme: thirty active days of self-care and emotional support.
Center: a strong green plant with layered leaves, stable and balanced, with soft light behind it.
Add a subtle circular glow suggesting consistency and inner support.
Style: premium soft 3D illustration, glassmorphism, pastel emerald, mint, warm beige, gentle shadows, rounded badge shape.
No text, no numbers, no trophy, no medal, no fireworks.
Mood: steady, grounded, warm, non-pressuring.
1:1 aspect ratio, high resolution.

⸻

4. 100 дней заботы

Название

100 дней заботы

Текст

Это уже не случайность. Ты выстроил ритм, который поддерживает тебя.

Визуал

Мини-сад: несколько растений, мягкий свет, глубокий спокойный фон.

Промпт

A beautiful milestone badge icon for a mental wellness app.
Theme: one hundred days of self-care and consistent emotional practice.
Center: a small peaceful garden with several healthy plants, soft leaves, tiny water drops, and a warm glowing atmosphere.
Style: premium soft 3D illustration, glassmorphism badge, pastel green, teal, lavender, warm light, rounded circular frame, subtle depth.
No text, no numbers, no trophy, no medal, no aggressive achievement style.
Mood: deep calm, resilience, long-term care, quiet pride.
1:1 aspect ratio, mobile app icon.

⸻

5. Первая опора

Название

Первая опора

Текст

Ты сохранил мысль, к которой можно вернуться.

Визуал

Маленькая карточка с мягким сиянием, рядом лист или капля.

Промпт

A soft milestone badge icon for a self-help mobile app.
Theme: saving the first supportive thought.
Center: a small glowing note card with a simple leaf symbol on it, next to a tiny water drop.
Style: minimal warm 3D, glassmorphism, rounded circular badge, pastel cream, mint, soft blue, gentle light.
No readable text, no numbers, no trophy, no medal.
Mood: reflective, safe, supportive, personal.
1:1 aspect ratio, high quality mobile UI icon.

⸻

6. Ты вернулся

Название

Ты вернулся

Текст

Пауза не отменяет путь. Продолжать можно с любого места.

Визуал

Растение после мягкого полива, капля падает на лист. Не "сломанное растение", не "засохшее растение".

Промпт

A compassionate milestone badge icon for a mental self-help mobile app.
Theme: returning after a pause without guilt.
Center: a calm green plant receiving one gentle water drop on a leaf, with soft renewed glow.
The plant should look alive and cared for, not damaged, not sad, not dry.
Style: soft 3D illustration, glassmorphism, pastel green and blue, rounded circular badge, gentle lighting, minimal premium mobile UI.
No text, no numbers, no trophy, no medal, no shame, no warning symbols.
Mood: acceptance, return, kindness, emotional safety.
1:1 aspect ratio.

⸻

4. Коллекция бейджей садов

Каждый сад (программа) при завершении даёт уникальный бейдж. Бейдж визуально отражает тему программы. Это делает экран "Знаки пути" личным — пользователь видит конкретно, какой путь прошёл.

Почему уникальные бейджи для каждого сада, а не один общий "Путь пройден":

- Один бейдж теряет смысл после второго завершения — ты его уже получал.
- Уникальный бейдж каждого сада создаёт коллекцию с нарративом.
- Визуал отражает тему: тревога, сон, уверенность, стресс — каждый бейдж узнаваем.
- 9+ уникальных бейджей — это полноценная коллекция, а не список одинаковых иконок.

Шаблонная структура для бейджа сада

Название: [Название программы]
Текст: [1-2 предложения, тональность Mentala — тепло, без пафоса]
id: garden*[slug*программы]
category: garden

Шаблонный промпт (заполнять под тему каждой программы):

A unique completion badge icon for a mental self-help mobile app.
Theme: completing a personal growth program about [ТЕМА_ПРОГРАММЫ].
Center: [КЛЮЧЕВОЙ_ОБРАЗ_ТЕМЫ] — calm and resolved, not triumphant.
Style: soft 3D illustration, glassmorphism, pastel [ЦВЕТ_ПАЛИТРЫ], warm light, rounded circular badge, gentle inner glow.
No text, no numbers, no trophy, no medal, no fireworks.
Mood: [НАСТРОЕНИЕ_ПРОГРАММЫ], peaceful completion, self-respect.
1:1 aspect ratio, high quality mobile app icon.

Промпты для каждого сада — финальный цветок программы как изображение бейджа

Логика: бейдж сада = финальная стадия растения, которое пользователь вырастил.
Визуально: ботанически точный финальный bloom в стиле glassmorphism badge.

⸻

Сад #1 — Спокойствие (calm_anxiety_30)

id: garden_calm_anxiety_30
Название: Орхидея спокойствия
Текст: Ты научился жить рядом с тревогой, а не против неё.
Растение: Орхидея фаленопсис (Phalaenopsis), финальная стадия
Файл: badge_garden_calm_anxiety_30.webp

Промпт:

A premium milestone badge icon for a mental wellness app.
Theme: completing a program about finding calm amid anxiety.
Center: a fully bloomed Phalaenopsis orchid with three graceful flower spikes,
pearl-white petals with delicate rose-pink and soft lavender tones, gold-spotted
center lip, displayed as a beautiful botanical illustration inside a circular
glassmorphism badge.
The flower fills most of the badge, slightly off-center to the right, balanced
by gently arching flower spikes.
Style: premium soft 3D botanical illustration, glassmorphism, rounded circular
badge, pearl white, soft rose, lavender, gentle inner glow, subtle depth.
No text, no numbers, no trophy, no medal.
Mood: refined elegance, quiet control, inner peace.
1:1 aspect ratio, high quality mobile app icon.

⸻

Сад #2 — Доброта к себе (self_kindness_21)

id: garden_self_kindness_21
Название: Пион принятия
Текст: Быть добрым к себе сложнее, чем кажется. Ты это сделал.
Растение: Пион обыкновенный (Paeonia lactiflora), финальная стадия
Файл: badge_garden_self_kindness_21.webp

Промпт:

A premium milestone badge icon for a mental wellness app.
Theme: completing a program about self-kindness and self-acceptance.
Center: a fully bloomed Paeonia lactiflora peony — a generous ball of many
layered blush-pink petals, almost the size of a dinner plate, with deep coral
center and cream-white highlights, displayed as a luxurious botanical
illustration inside a circular glassmorphism badge.
The flower is full, round, and almost fills the badge entirely.
Style: premium soft 3D botanical illustration, glassmorphism, rounded circular
badge, blush pink, coral, warm cream, soft burgundy depth, gentle inner glow.
No text, no numbers, no trophy, no medal.
Mood: generosity, warm fullness, soft acceptance, tender strength.
1:1 aspect ratio, high quality mobile app icon.

⸻

Сад #3 — Отношения (relationships_21)

id: garden_relationships_21
Название: Цикламен близости
Текст: Ты разобрался, где заканчиваешься ты и начинаются другие.
Растение: Цикламен персидский (Cyclamen persicum), финальная стадия
Файл: badge_garden_relationships_21.webp

Промпт:

A premium milestone badge icon for a mental wellness app.
Theme: completing a program about relationships, boundaries, and closeness.
Center: a fully bloomed Cyclamen persicum — several slender stems each holding
one flower with petals swept sharply upward like delicate wings, rose-magenta
and soft pink, above dark green heart-shaped leaves with silver-grey marbling,
displayed as a botanical illustration inside a circular glassmorphism badge.
Style: premium soft 3D botanical illustration, glassmorphism, rounded circular
badge, rose-magenta, soft pink, silver-green, white throat, gentle inner glow.
No text, no numbers, no trophy, no medal.
Mood: gentle boundaries, warm closeness, quiet resilience.
1:1 aspect ratio, high quality mobile app icon.

⸻

Сад #4 — Выгорание и восстановление (burnout_21)

id: garden_burnout_21
Название: Азалия возвращения
Текст: Ты прошёл через истощение и нашёл дорогу обратно к себе.
Растение: Комнатная азалия (Rhododendron simsii), финальная стадия
Файл: badge_garden_burnout_21.webp

Промпт:

A premium milestone badge icon for a mental wellness app.
Theme: completing a program about burnout recovery and returning to yourself.
Center: a fully bloomed indoor azalea (Rhododendron simsii) — a compact round
shrub densely covered with ruffled double flowers in coral-pink and
salmon-peach, clustered generously over dark glossy leaves, displayed as a
rich botanical illustration inside a circular glassmorphism badge.
The plant fills the badge with warmth and quiet abundance.
Style: premium soft 3D botanical illustration, glassmorphism, rounded circular
badge, coral pink, salmon peach, warm white, dark glossy green, gentle glow.
No text, no numbers, no trophy, no medal.
Mood: recovery after exhaustion, color returning gently, generous resilience.
1:1 aspect ratio, high quality mobile app icon.

⸻

Сад #5 — Мягкий сон (gentle_sleep_21)

id: garden_gentle_sleep_21
Название: Тюльпан ночи
Текст: Ночь стала тише. Ты вернул себе отдых.
Растение: Тюльпан Queen of Night (Tulipa "Queen of Night"), финальная стадия
Файл: badge_garden_gentle_sleep_21.webp

Промпт:

A premium milestone badge icon for a mental wellness app.
Theme: completing a program about sleep quality and night rest.
Center: a fully bloomed Tulipa "Queen of Night" — a single classic tulip with
a deep velvety almost-black purple bloom, the cup fully open to reveal the
dusky interior, dark eggplant and ink-purple tones, on a slender stem with
smooth narrow leaves, displayed as a botanical illustration inside a circular
glassmorphism badge with a subtle night-sky atmosphere.
Style: premium soft 3D botanical illustration, glassmorphism, rounded circular
badge, deep velvety purple-black, aubergine, indigo, very soft silver glow
around the flower suggesting moonlight.
No text, no numbers, no trophy, no medal.
Mood: quiet dignity, depth of night, gentle release, safe rest.
1:1 aspect ratio, high quality mobile app icon.

⸻

Будущие сады (добавить промпт при создании программы)

Сад «Принятие сложного» → Роза hybrid tea (rose)
Свободный кандидат → Глициния (wisteria)
Финальный сад #9 → Король Протея (king_protea)

Для каждого: botanical illustration финального bloom + glassmorphism badge,
имя файла: badge_garden_[programSlug].webp

⸻

5. Как должны выглядеть locked-бейджи

Заблокированные бейджи не должны выглядеть как "тебе недоступно". Лучше — как "это впереди".

Визуал locked-состояния

- серо-лавандовый или приглушённый mint;
- иконка видна силуэтом;
- маленький замок не нужен, он слишком "платёжный";
- лучше использовать эффект тумана или мягкой непрозрачности.

Текст

Не:

Ещё не получено

Лучше:

Впереди

или:

Откроется по пути

Для бейджей садов — дополнительная логика:

Если сад ещё не начат: "Откроется после прохождения [название сада]"
Если сад в процессе: силуэт без текста-описания (пусть будет загадкой)

⸻

6. Celebration после получения бейджа

Что показывать

После получения бейджа не нужен fullscreen-фейерверк. Для Mentala лучше:

1. Небольшой bottom sheet или modal card.
2. Бейдж плавно появляется с scale 0.92 → 1.
3. Мягкое свечение 1–2 секунды.
4. 3–5 маленьких частиц-капель.
5. Текст:
   Новый знак пути
6. Кнопки:
   - Посмотреть
   - Продолжить

Формулировка

Новый знак пути
[Название бейджа]
[Текст бейджа]

Для приложения самопомощи это лучше, чем "Поздравляем! Ты получил достижение!". Второе звучит как фитнес-браслет, который тайно осуждает тебя за диван.

⸻

7. Экран бейджей

Название экрана

Знаки пути

Почему не "Достижения":

- "Достижения" звучит более соревновательно;
- "Знаки пути" мягче и лучше подходит к Roadmap, садам и self-help.

Структура экрана

Знаки пути
Здесь собраны важные отметки твоего движения.
Не для оценки, а чтобы видеть: путь действительно складывается.

[Полученные]

- Первый шаг
- Первая опора
- Первая неделя

[Впереди]

- 30 дней рядом с собой
- 100 дней заботы
- Ты вернулся (без текста на locked — появится сам)

[Сады]
Подзаголовок: "Завершённые программы"

- сетка бейджей садов: полученные + силуэты ещё не пройденных
- силуэты не подписаны названием до прохождения (сохраняем интригу) — или подписаны, это на усмотрение продукта

⸻

8. Категории бейджей

| Категория    | Что внутри                                    |
| ------------ | --------------------------------------------- |
| Начало пути  | Первый шаг, Первая опора                      |
| Регулярность | Первая неделя, 30 дней, 100 дней              |
| Сады         | Уникальный бейдж каждой завершённой программы |
| Возвращение  | Ты вернулся                                   |

⸻

9. Что не стоит делать

Не стоит использовать такие бейджи

Без пропусков
Идеальная неделя
Ты не сдался
Победа над тревогой
Победитель
Железная дисциплина

Почему плохо:

- усиливают давление;
- создают ощущение провала при пропуске;
- конфликтуют с идеей self-help;
- "победа над тревогой" звучит клинически и неправдиво.

Лучше так

| Плохо               | Лучше               |
| ------------------- | ------------------- |
| Идеальная неделя    | Первая неделя       |
| Без пропусков       | Ритм появился       |
| Ты не сдался        | Ты вернулся         |
| Победа над тревогой | Стало больше опор   |
| Железная дисциплина | Мягкая регулярность |

⸻

10. Рекомендованная первая версия

Для первого production-релиза — 7 универсальных бейджей + бейджи садов (по одному на каждую программу).

export const milestoneBadges = [
{
id: 'first_step',
title: 'Первый шаг',
description: 'Ты начал путь. Маленькое действие уже считается.',
category: 'start',
},
{
id: 'first_thought_saved',
title: 'Первая опора',
description: 'Ты сохранил мысль, к которой можно вернуться.',
category: 'start',
},
{
id: 'first_week',
title: 'Первая неделя',
description: 'Семь дней заботы. Не идеально, а достаточно.',
category: 'regularity',
},
{
id: 'thirty_active_days',
title: '30 дней рядом с собой',
description: 'Ты возвращался к себе снова и снова. Это уже опора.',
category: 'regularity',
},
{
id: 'hundred_active_days',
title: '100 дней заботы',
description: 'Это уже не случайность. Ты выстроил ритм, который поддерживает тебя.',
category: 'regularity',
},
{
id: 'returned_after_pause',
title: 'Ты вернулся',
description: 'Пауза не отменяет путь. Продолжать можно с любого места.',
category: 'return',
},
// Бейджи садов — добавлять по мере создания программ:
{
id: 'garden_anxiety',
title: 'Путь через тревогу',
description: 'Ты научился жить рядом с тревогой, а не против неё.',
category: 'garden',
gardenSlug: 'anxiety',
},
{
id: 'garden_sleep',
title: 'Ночь стала тише',
description: 'Ты вернул себе отдых. Это важнее, чем кажется.',
category: 'garden',
gardenSlug: 'sleep',
},
// ... остальные сады по мере формирования
] as const

⸻

11. Дополнительные бейджи на будущее

После первого релиза можно добавить:

Практики

- Первое дыхание — первая дыхательная практика.
- Тихая минута — первая медитация.
- Записано внутри — первая запись в дневнике.
- Быстрая помощь использована — первая SOS или grounding-практика.

Программы

- Три сада пройдены.
- Новый маршрут выбран.

Thought of the Day

- 5 мыслей сохранено.
- 21 мысль сохранена.
- Коллекция опор.

⸻

12. Название фичи

Внутри кода оставить:

Milestone Badges / milestone_badges

В интерфейсе не использовать "бейджи" как основной термин.

Лучшие варианты для пользователя:

Знаки пути

А отдельный бейдж:

Знак пути

Пример celebration:

Новый знак пути
Первый шаг
Ты начал путь. Маленькое действие уже считается.

Это звучит мягко, взросло и в духе Mentala. Не как "получи ачивку за то, что сегодня не развалился".
