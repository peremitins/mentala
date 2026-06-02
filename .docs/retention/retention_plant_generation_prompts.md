# Растения коллекции — список и промпты для AI-генерации

Дата: 2026-05-15. Связан с `.docs/retention/retention_long_term_strategy.md`.

Этот документ — рабочий справочник для генерации ассетов растений. Описывает:

- какие растения нужны для 9-Садной прогрессии,
- какие резервные растения есть для сезонных мини-челленджей,
- сколько всего стадий нужно отрендерить,
- готовые промпты для AI-image-generator'а с учётом требований к консистентности.

## 1. Цифры

### 1.1. Сколько стадий нужно

- **9 растений × 15 стадий = 135 ассетов** для основной прогрессии.
- **+ резерв 14 растений × 15 стадий = 210 ассетов** для будущих сезонных мини-челленджей и бонусов (опционально, можно генерировать по мере необходимости).

Итого минимально нужно: **135 ассетов** для основного пути.

> **Изменение от первоначального плана (был 16).** Отказались от отдельных
> кадров **«семя в почве»** и **«проросток без листьев»** — они занимали 2
> первые стадии 16-кадрового пути и плохо считывались на превью маленького
> размера. Первая стадия теперь — **уже маленькое растение с зелёными
> листьями**, без бутона; это стартовая точка, которую пользователь видит
> сразу после регистрации.

### 1.2. Технические параметры (наследуем из `retention_animation_flowers.md`)

| Параметр              | Требование                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Формат                | WebP                                                                                                                                                                                                                                                                                                                                                 |
| Размер исходника      | 1024×1024                                                                                                                                                                                                                                                                                                                                            |
| Размер для production | 768×768 или 512×512                                                                                                                                                                                                                                                                                                                                  |
| Соотношение           | 1:1                                                                                                                                                                                                                                                                                                                                                  |
| Фон                   | Прозрачный                                                                                                                                                                                                                                                                                                                                           |
| Объект                | Центрирован                                                                                                                                                                                                                                                                                                                                          |
| Позиция горшка        | Одинаковая во всех стадиях одного растения; **горшок всегда полностью виден** — не обрезан снизу или по бокам                                                                                                                                                                                                                                        |
| Основание горшка      | Фиксированная baseline-позиция: низ горшка на одной и той же высоте, примерно **30 px от нижнего края** для исходника 1024×1024 на всех 15 стадиях                                                                                                                                                                                                   |
| Рост растения         | Растение растёт от зафиксированного горшка вверх: стебли, листья, бутоны и цветы меняются, но горшок не сдвигается, не масштабируется, не сжимается и не меняет пропорции между стадиями                                                                                                                                                             |
| Обрезка               | **Запрещено обрезать горшок или верхушку растения.** На поздних стадиях (10–15) нельзя приближать композицию или увеличивать растение так, чтобы оно выходило за края кадра. Если растение становится слишком высоким или широким, компактнее делается только силуэт растения над фиксированным горшком; сам горшок не двигается и не масштабируется |
| Цветовая температура  | Одинаковая внутри одного растения                                                                                                                                                                                                                                                                                                                    |
| Свет                  | Мягкий, одинаковый                                                                                                                                                                                                                                                                                                                                   |
| Тень                  | Либо отсутствует, либо одинаковая                                                                                                                                                                                                                                                                                                                    |
| Вес одного файла      | До 250–350 KB                                                                                                                                                                                                                                                                                                                                        |
| Стиль                 | Premium botanical product, photo-realistic                                                                                                                                                                                                                                                                                                           |

### 1.2.1. Фиксированная сетка композиции

Для всех plant-set'ов используется единая проверяемая сетка исходника:

````text
Canvas: 1024×1024 px
Pot center X: 512 px
Pot bottom baseline Y: 994 px
Bottom margin: 30 px
Allowed baseline deviation: максимум 6 px
Pot reference shape: classic slightly conical terracotta pot, like orchid stage 3 reference
Pot top rim width: 410-440 px
Pot bottom width: 300-330 px
Pot visible height: 320-350 px
Pot rim height: 70-90 px
Pot top rim Y: примерно 650-675 px
Pot bottom Y: 994 px
Pot aspect ratio: width/height примерно 1.25-1.35
Safe area for full object: X=64-960 px, Y=48-994 px
Top margin: минимум 48 px
Left/right margin: минимум 64 px

Правило важнее художественной пышности: финальная стадия не должна быть крупным
планом. Если растение на стадиях 10-15 становится высоким или широким, нужно
делать силуэт компактнее и аккуратнее, но не двигать, не увеличивать и не
перерисовывать горшок. Горшок остаётся якорем всей серии.

### 1.2.2. Фиксированная форма горшка

Для каждого plant-set'а нужно выбрать один эталонный горшок и держать его

неизменным на всех 15 стадиях. Для `orchid` эталоном считается горшок из

`plant-03.webp`: классический матовый терракотовый горшок, слегка конический,

с широкой округлой верхней кромкой, более узким основанием и естественной

шероховатой текстурой керамики.

Важно: если на конкретном исходном кадре горшок получился сплюснутым,

растянутым, слишком высоким или слишком широким, это не считается эталоном.

Генератор должен возвращаться к выбранной стандартной форме горшка, а не

копировать случайную деформацию из отдельной стадии.

Жёсткие правила для горшка:

- ширина, высота, перспектива и пропорции горшка одинаковы на всех стадиях;

- верхняя кромка горшка не становится ниже, выше, шире или уже между стадиями;

- основание горшка не становится шире или уже между стадиями;

- горшок не выглядит сплюснутым по вертикали или растянутым по горизонтали;

- горшок не превращается в миску, вазу, кашпо другой формы или низкий широкий контейнер;

- меняется только растение над горшком: листья, стебли, бутоны и цветы.

Рекомендуемый размер горшка для исходника 1024×1024:

```text

Pot top rim width: 410-440 px

Pot bottom width: 300-330 px

Pot visible height: 320-350 px

Pot rim height: 70-90 px

Pot bottom baseline Y: 994 px

Pot center X: 512 px

### 1.3. Naming convention

````

public/retention/plant/states/{plant-set-slug}/plant-01.webp
public/retention/plant/states/{plant-set-slug}/plant-02.webp
...
public/retention/plant/states/{plant-set-slug}/plant-15.webp

```

где `{plant-set-slug}` — `orchid`, `rose`, `sunflower`, `tulip_queen_of_night` и т.д.

Сейчас в проекте используется flat-структура `public/retention/plant/states/plant-01.webp` для дефолтной орхидеи — мы её преобразуем в подкаталог `orchid/`, а старый путь оставляем как символическую ссылку или fallback (см. вопрос backward compatibility в основном документе).

## 2. Основной пул — 9 растений

Прогрессия: знакомое → элегантное → монументально-редкое. По цветовой палитре старт тёплый (золото, лаванда, пурпур), финал — драгоценные тона.

### Слой 1. Базовые / классические (Сады #1–#5, редкость 1–4)

#### 1. Подсолнух — _Helianthus annuus_ (slug: `sunflower`)

Эмоция: оптимизм, тёплое утро, простая радость. Большая жёлтая голова, спираль Фибоначчи в центре, мощный стебель.
Палитра: золотисто-жёлтый, охра, шоколадная сердцевина, насыщенно-зелёный стебель.
Редкость: 1.

#### 2. Пион — _Paeonia lactiflora_ (slug: `peony`)

Эмоция: щедрость, принятие себя, мягкая полнота. Огромные пышные шары лепестков размером с тарелку, ассоциация с теплом и заботой.
Палитра: румяно-розовый, коралл, белый с румянцем, бордо в глубине.
Редкость: 2 (по эстетике на уровне 6).
**Ассеты × 15 стадий уже готовы** в `public/retention/plant/states/peony/`. Закреплено за Садом «Доброта к себе» (`self_kindness_21`).

#### 3. Тюльпан Queen of Night — _Tulipa_ "Queen of Night" (slug: `tulip_queen_of_night`)

Эмоция: спокойное достоинство, глубина ночи, отпускание дня. Бархатно-чёрный, почти-пурпурный тюльпан, чистая геометрия.
Палитра: тёмно-пурпурный, баклажан, чернильный с фиолетовым отблеском.
Редкость: 3.

#### 4. Ландыш — _Convallaria majalis_ (slug: `lily_of_the_valley`)

Эмоция: нежность, начало дня, утренняя свежесть. Молочно-белые фарфоровые колокольчики на изогнутом стебле, ярко-зелёные листья.
Палитра: молочно-белый, нежно-зелёный, светло-салатовый.
Редкость: 3.

#### 5. Глициния — _Wisteria floribunda_ (slug: `wisteria`)

Эмоция: восстановление после истощения; терпение, которое наконец приносит плоды; красота, рождённая из трудности. Каскадные грозди фиолетово-лавандовых цветов, ниспадающие как водопад с лозы. Один из самых визуально мощных цветущих кустарников.
Палитра: лавандово-фиолетовый, сиреневый, нежно-пурпурный с розоватым оттенком, серебристо-зелёная листва.
Редкость: 4.
Свободный кандидат: ранее планировалась для `burnout_21`, теперь этот Сад закреплён за Комнатной азалией (`azalea`). Глицинию можно использовать для одного из будущих Садов.

#### 5a. Цикламен персидский — _Cyclamen persicum_ (slug: `cyclamen`)

Эмоция: бережные границы, тёплая близость, тихая стойкость. Изящные лепестки, отогнутые вверх как крылья, над сердцевидными листьями с серебристым узором. Цветок, который держится в трудный сезон.
Палитра: розово-малиновый, нежно-розовый, белый с румяным горлом, тёмно-зелёные листья с серебристо-мраморным рисунком.
Редкость: 3.
**Ассеты × 15 стадий уже готовы** в `public/retention/plant/states/cyclamen/`. Закреплён за Садом «Отношения / границы / близость» (`relationships_21`).

#### 5b. Комнатная азалия — _Rhododendron simsii_ (slug: `azalea`)

Эмоция: восстановление после истощения, бережное возвращение цвета, мягкая щедрость без надрыва. Компактный куст, плотно усыпанный многочисленными махровыми цветами поверх тёмной глянцевой листвы.
Палитра: кораллово-розовый, лососёво-персиковый, тёпло-белый с румянцем, тёмно-зелёная глянцевая листва.
Редкость: 4.
Закреплена за Садом «Выгорание / восстановление» (`burnout_21`). Ассеты × 15 стадий к генерации.

### Слой 2. Элегантно-драматичные (Сады #6–#8, редкость 5–7)

#### 6. Орхидея фаленопсис — _Phalaenopsis_ spp. (slug: `orchid`)

Эмоция: утончённая граница, симметрия, восточная элегантность. **Закреплена за Садом «Спокойствие» (`calm_anxiety_30`).** Ассеты × 15 стадий уже готовы в `public/retention/plant/states/orchid/`.
Палитра: жемчужно-белый, нежно-лиловый, розово-пятнистый, золотисто-жёлтый центр.
Редкость: 5.

#### 7. Георгин Café au Lait — _Dahlia_ "Café au Lait" (slug: `dahlia_cafe`)

Эмоция: радость, праздничность, романтика без пафоса. Геометрический шар из сотен симметричных лепестков, кремово-телесная палитра.
Палитра: пыльно-розовый, кофе с молоком, персиковый, кремовый.
Редкость: 5.

#### 8. Ирис — _Iris germanica_ (slug: `iris`)

Эмоция: благородство, ясность в общении, "королевский" сигнал. Скульптурные крылья лепестков, fleur-de-lis-силуэт.
Палитра: глубокий фиолетовый, индиго, светло-сиреневый, золото в горле, бархатно-чёрные жилки.
Редкость: 6.
Свободный кандидат: ранее планировался для `relationships_21`, теперь этот Сад закреплён за Цикламеном персидским (`cyclamen`). Ирис можно использовать для одного из будущих Садов.

### Слой 3. Финальный / wow-цветок (Сад #9, редкость 8–10)

#### 9. Король Протея — _Protea cynaroides_ (slug: `king_protea`)

Эмоция: древняя сила, монументальная зрелость, корни. Чаша диаметром до 30 см, лепестки острые как языки пламени.
Палитра: розовато-серебристый снаружи, кремовый, бордовый центр, серебристо-зелёные листья.
Редкость: 8.

## 3. Резервный пул (для сезонных мини-челленджей и будущих Садов)

10 цветков, которые можно использовать как награды за мини-челленджи или ввести в новые Сады в P3+:

1. **Магнолия** — _Magnolia × soulangeana_ (`magnolia`). Розово-пурпурный градиент, монументальная элегантность.
2. **Сакура** — _Prunus serrulata_ (`sakura`). Бледно-розовый, поэзия эфемерности.
3. **Лилия Stargazer** — _Lilium_ "Stargazer" (`lily_stargazer`). Малиновый с белым, ароматная звезда.
4. **Ранункулюс** — _Ranunculus asiaticus_ (`ranunculus`). Коралл/лосось, "роза с текстурой".
5. **Стрелиция (Райская птица)** — _Strelitzia reginae_ (`bird_of_paradise`). Огненно-оранжевый + электрик-синий, драматичный тропический силуэт.
6. **Хризантема** — _Chrysanthemum × morifolium_ (`chrysanthemum`). Бронза/рубин/золото, символ долголетия.
7. **Гортензия** — _Hydrangea macrophylla_ (`hydrangea`). Небесно-голубой/лавандовый, шапка-облако.
8. **Душистый горошек** — _Lathyrus odoratus_ (`sweet_pea`). Пастельная радуга, "цветок-акварель".
9. **Страстоцвет** — _Passiflora caerulea_ (`passion_flower`). Белый + сине-фиолетовые нити, инопланетная структура.
10. **Священный лотос** — _Nelumbo nucifera_ (`sacred_lotus`). Жемчужно-розовый + золотой центр, символ просветления.

## 4. Стадии роста — что отображает каждый из 15 уровней

Эта спецификация общая для всех растений. Конкретные визуальные характеристики каждой стадии подставляются в промпт ниже.

> **Внимание контент-дизайнеру.** Стартовая стадия — не отдельное «семя» и
> не случайный пустой кадр. Предпочтительный `plant-01.webp` — молодое
> растение с первыми листьями; если выбран старт с почвой/посадкой, это должно
> быть осознанным решением для всего plant-set и отражаться в подписи.

| #   | Стадия                    | Что должно быть видно                                                                                                                                                                                                        |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Начало роста              | Стартовый кадр: посадка уже началась. Предпочтительно маленькое растение с листьями; если нужен «горшок с почвой», он допустим только как единый осознанный стиль для конкретного plant-set. Без бутона и цветных лепестков. |
| 2   | Первые листья             | Молодые листья становятся читаемыми, растение ещё низкое.                                                                                                                                                                    |
| 3   | Листья раскрываются       | Листва заметно шире и насыщеннее, появляется ощущение укрепления.                                                                                                                                                            |
| 4   | Растение крепнет          | Больше зелёной массы, первые вертикальные линии/побеги, но без раскрытого цветка в канонической шкале.                                                                                                                       |
| 5   | Крона набирает форму      | Силуэт становится плотнее и ближе к будущей форме растения.                                                                                                                                                                  |
| 6   | Зелёная масса растёт      | Растение выглядит устойчивым, зелень занимает большую часть финального объёма.                                                                                                                                               |
| 7   | Появляется бутон          | Первый маленький закрытый бутон или явный намёк на будущий цветонос.                                                                                                                                                         |
| 8   | Бутоны набирают силу      | Бутон/бутоны крупнее, но ещё закрыты.                                                                                                                                                                                        |
| 9   | Бутоны округляются        | Бутоны заметно набрали форму и цветовой оттенок будущего цветка.                                                                                                                                                             |
| 10  | Цвет готовится раскрыться | Бутон полностью сформирован, первые края лепестков могут только намечаться.                                                                                                                                                  |
| 11  | Первые лепестки           | Видны первые лепестки или первые небольшие раскрытые цветы.                                                                                                                                                                  |
| 12  | Цветок раскрывается       | Основной цветок раскрыт примерно на 30-50%, форма уже узнаваема.                                                                                                                                                             |
| 13  | Цветение набирает форму   | Цветение 60-80%, палитра и форма хорошо читаются.                                                                                                                                                                            |
| 14  | Цветение почти полное     | Почти финальный объём без максимальной пышности/финального вау-эффекта.                                                                                                                                                      |
| 15  | Пышное цветение           | Финальная стадия с максимальной красотой: полный bloom, насыщенная палитра, допустимы несколько цветков и мягкий glow.                                                                                                       |

**Важно**: разница между стадиями должна быть **плавной**, чтобы crossfade между соседними состояниями выглядел естественно. Нельзя перепрыгнуть с «бутон» сразу на «полное цветение».

**Позиция горшка одинаковая** во всех 15 стадиях. **Тип горшка** — терракотовый матовый, классический, нейтральный (не отвлекает от растения). Горшок — визуальный якорь серии: его нижняя кромка, ширина, угол и масштаб не меняются между `plant-01.webp` и `plant-15.webp`. Рост должен происходить из этой фиксированной точки вверх; если поздняя стадия становится высокой или пышной, нельзя «приближать» растение так, чтобы горшок обрезался. Вместо этого нужно заранее оставлять верхний запас кадра и при необходимости делать финальный силуэт компактнее.

### 4.1. Аудит текущих asset-set'ов

Текущие готовые наборы не полностью совпадают с канонической таблицей выше:

- `orchid`: цветоносы видны уже на `plant-03.webp`, первые цветы — на `plant-04.webp`, полноценное цветение начинается сильно раньше стадии 11. В коде для `orchid` задан отдельный список подписей, чтобы текущий UI соответствовал фактическим картинкам.
- `peony`: `plant-01.webp` показывает горшок с почвой без зелёных листьев; бутоны появляются примерно на `plant-07.webp`, первые цветы — на `plant-11.webp`. В коде для `peony` тоже задан отдельный список подписей.

Для новых plant-set'ов ориентир — каноническая таблица п. 4. Если генератор
сдвигает цветение слишком рано/поздно, нужно либо перегенерировать набор, либо
добавить plant-set-specific подписи в `app/utils/retentionPlant.ts`, чтобы
пользовательский текст не противоречил уже утверждённым изображениям.

## 5. Универсальный шаблон промпта для генерации

Используется для image-генератора (Midjourney, DALL-E 3, Flux, Stable Diffusion). Параметры в `{...}` подставляются.

### 5.1. Базовый промпт (используется для всех 15 стадий одного растения)

```

A premium botanical product photograph of {plant_name_en}, {plant_latin_name},
shown at growth stage {stage_number} of 15: {stage_description}.
Note: stage 1 is the intentional beginning of growth: preferably a small
healthy plant with first green leaves, no flower bud yet. If a planted-soil
start is chosen for this specific plant-set, keep it deliberate and consistent.
Final stage 15 is full bloom.

Composition: a single {pot_color} terracotta pot, matte finish, centered in the
frame. The pot is identical in position, size, and angle across all 15 stages —
only the plant changes.

Locked composition grid: use a strict 1024x1024 square canvas. The pot is the
fixed anchor object for the entire 15-image series.

Place the pot center at X=512 px. Place the bottom edge of the pot at Y=994 px,
leaving about 30 px of transparent empty space below the pot. Keep this same pot
baseline in every stage with no visible vertical drift. Allowed vertical
deviation between stages: maximum 6 px.

The pot must keep identical size, perspective, proportions, color, rim shape, material, texture and angle across all 15 stages. Use one fixed reference pot shape for the whole plant set: a classic matte terracotta pot, slightly conical, with a wide rounded upper rim, narrower bottom, natural rough ceramic texture, and proportions similar to the orchid stage 3 reference. Do not scale, move, zoom, stretch, squash, flatten, widen, narrow, redraw or redesign the pot between stages.

Pot size must stay stable: top rim width about 410-440 px, bottom width about

300-330 px, visible pot height about 320-350 px, rim height about 70-90 px.

The pot must never become a low wide bowl, a flat container, a vase, or a different planter shape. If any source stage has a distorted pot, ignore that distortion and restore the standard reference pot proportions.

The full plant and pot must fit inside the safe area: X=64-960 px and
Y=48-994 px. Keep at least 48 px top margin in every stage and at least 64 px
left and right margins. Do not crop the pot at the bottom or sides. The plant
must grow upward from this fixed pot anchor: stems, leaves, buds, and flowers
expand above the pot while the pot does not move, zoom, or change scale.

Plant characteristics: {plant_visual_characteristics}.
Color palette: {color_palette}.

Lighting: soft natural daylight from upper-left, gentle diffused shadow on the
right side of the pot only. No harsh highlights. Same lighting setup across all
stages.

Style: photo-realistic, hyper-detailed, premium product photography, magazine
quality, clean white seamless background that will be cut out to transparency.
No text, no watermarks, no other objects.

Camera: medium telephoto, slight upward angle to make the plant feel grounded.
Square 1:1 framing. Keep the full plant and the full pot inside the frame. On
tall or fully blooming stages, zoom out the plant silhouette above the fixed pot
anchor or make the flowering silhouette more compact so the top flower is not
cropped and the pot remains fully visible. Do not create a close-up at the final
stage. Reserve clear top margin for stages 10-15.

Mood: serene, meditative, premium wellness aesthetic. Not childish, not cartoonish.

Technical: 1024x1024, transparent background after export, WebP, max 350KB.

The pot is not part of the growth animation. The pot is a locked reference object. Only the plant grows. The pot must remain identical in shape, size, proportions, perspective and position from stage 1 to stage 15.

```

### 5.2. Подстановки для каждой стадии (`{stage_description}`)

Берём из таблицы в п. 4 и адаптируем под конкретное растение. Пример для розы, стадия 11 «Бутон крепкий»:

```

{stage_description}:
A firmly formed, tightly closed flower bud sits at the top of the main stem.
The bud has the deep crimson-red color of the final rose, but the petals are
still wrapped tight. The plant has full healthy foliage of dark green
serrated leaves. No petals are visible yet.

```

### 5.3. Подстановки для растения (`{plant_visual_characteristics}` + `{color_palette}`)

Заполняется один раз на растение, переиспользуется во всех 15 промптах для этого растения. Примеры ниже в п. 6.

## 6. Полные промпты для 12 основных растений

> Это **базовые** промпты. Для каждой из 15 стадий нужно добавить `{stage_description}` из таблицы п. 4, адаптированный под конкретное растение.

### 6.1. `sunflower` — Подсолнух

```

Plant: Helianthus annuus, classic sunflower.
Visual characteristics: tall single stem, broad heart-shaped textured leaves,
large composite flower head with golden-yellow ray petals around a dark
chocolate-brown spiral-textured center (Fibonacci pattern visible).
Color palette: golden yellow #f5b916, deep ochre #b67e0c, chocolate brown
#3d2a14 center, vibrant healthy green #4a6b2a leaves and stem.
Pot: small to medium terracotta pot, the plant grows visibly taller across
stages (stage 1 = young plant with green leaves, no flower bud yet;
stage 15 = full ~1.2m tall sunflower in bloom).
Mood: optimism, warm morning, generous joy.

```

### 6.2. `peony` — Пион (Сад «Доброта к себе»)

```

Plant: Paeonia lactiflora, classic herbaceous peony.
Visual characteristics: medium-thick green stem with deep-cut compound leaves,
single large flower head shaped like a generous ball of many layered petals.
Petal density is high, the flower looks almost the size of a small dinner
plate when fully open. No thorns. Stem leans gently under the weight of
the bloom.
Color palette: blush-pink #f4c2c2 outer petals fading to deep coral #e8869e
in the center, cream-white highlight #fbe9e3, deep burgundy #6e1a2a in the
shadows at the heart, healthy mid-green #5b7d3c leaves.
Pot: medium terracotta, the plant grows from a low bushy clump (not a tall
single-stem flower).
Mood: generosity, self-acceptance, warm fullness, soft strength.

```

> Полные 15 стадий peony уже сгенерированы и лежат в
> `public/retention/plant/states/peony/`. Этот промпт оставлен как
> reference для будущих переделок и сезонных вариаций.

### 6.3. `tulip_queen_of_night` — Тюльпан Queen of Night

```

Plant: Tulipa "Queen of Night", the famously dark almost-black tulip.
Visual characteristics: tall slender stem, two or three smooth narrow leaves
hugging the stem, a single classic tulip cup-shaped flower at the top.
Color palette: deep velvety blackish-purple #1f0d22, hints of dark aubergine
#3a1735 where light catches, dark eggplant green #3a4d2a leaves and stem.
Pot: small narrow terracotta, single tulip per stem (not a cluster).
Mood: quiet dignity, depth of night, gentle release of the day.

```

### 6.4. `lily_of_the_valley` — Ландыш

```

Plant: Convallaria majalis, lily of the valley.
Visual characteristics: low-growing plant, two broad pointed bright-green
leaves wrapping around a slender arched stem hung with small white bell-shaped
flowers in a one-sided row.
Color palette: milky porcelain white #f8f4ec flowers, fresh spring green
#7eb15c leaves, very pale green tinted shadows.
Pot: small shallow terracotta, the plant is short and elegant.
Mood: tenderness, morning freshness, first light.

```

### 6.5. `rose` — Роза (Сад «Принятие сложного»)

```

Plant: Rosa, classic garden rose, hybrid tea variety.
Visual characteristics: woody stem with thorns, compound leaves of dark
serrated leaflets in groups of 5-7, single large flower with many layered
velvety petals in classic high-centered form.
Color palette: rich crimson-red #b8123d, soft pink hints #d76b85, cream
center #f4e8d8, dark forest green leaves #2d4a1c.
Pot: medium terracotta, the plant is a compact rose bush, not a tall stem.
Mood: mature warmth, deep self-acceptance, grounded affection.

```

### 6.6. `orchid` — Орхидея фаленопсис (уже в проекте)

```

Plant: Phalaenopsis orchid, three flower spikes total (one on the left, one
center, one right) in final stage.
Visual characteristics: thick fleshy oval leaves at the base, tall arching
flower spikes with sequential waxy flowers, classic orchid lip in the center
of each flower.
Color palette: left spike rich rose pink #d56b88, center spike pale
white-with-blush #f3dde2, right spike light pink-lavender #d8bce0, all with
deep magenta lips and tiny yellow throat spots. Dark green leathery leaves.
Pot: classic terracotta, slightly conical.
Mood: refined boundary, symmetry, eastern elegance.

```

### 6.7. `dahlia_cafe` — Георгин Café au Lait

```

Plant: Dahlia "Café au Lait", dinner-plate dahlia.
Visual characteristics: tall sturdy stem, dark serrated divided leaves, one
huge perfectly geometric flower with hundreds of symmetrically arranged
petals forming a near-perfect sphere.
Color palette: dusty pink #e6c3b6 outer petals, coffee-with-cream #d5b29a
mid layers, peach #f0c5a1 near center, dark green #2e4527 leaves.
Pot: medium-tall terracotta.
Mood: festive joy, romance without showing off.

```

### 6.8. `iris` — Ирис

```

Plant: Iris germanica, bearded iris.
Visual characteristics: tall stem rising from a fan of sword-shaped
blue-green leaves, single dramatic flower with three upright standard petals
and three falling fall petals with a fuzzy yellow-orange beard.
Color palette: deep royal purple #3a2466 standards, indigo #2a1e5c falls,
golden-yellow #d4a72c beard at the throat, blue-green #6a8a6e leaves.
Pot: medium-tall classic terracotta.
Mood: nobility, clarity in communication, royal poise.

```

### 6.8a. `cyclamen` — Цикламен персидский (уже в проекте)

Ассеты × 15 стадий уже сгенерированы и лежат в
`public/retention/plant/states/cyclamen/`. Промпт оставлен как справка и для
возможной регенерации.

```

Plant: Cyclamen persicum, florist's cyclamen.
Visual characteristics: low compact plant, a rosette of heart-shaped dark
green leaves marbled with a silvery pattern, several slender upright stems each
holding one flower with petals swept sharply upward like wings.
Color palette: rose-magenta #c43b7a and soft pink #e89bc0 petals, white throat
with a blush, dark green leaves #25402a with silver-grey marbling.
Pot: small rounded terracotta, the plant stays low and bushy.
Mood: gentle boundaries, warm closeness, quiet resilience through a hard season.

```

### 6.8b. `azalea` — Комнатная азалия

```

Plant: Rhododendron simsii, indoor (florist) azalea, a compact flowering shrub.
Visual characteristics: small woody bush with dense dark glossy oval leaves,
covered with many ruffled double flowers clustered close together over the
foliage.
Color palette: coral-pink #e87a86 and salmon-peach #f0a989 petals, warm white
with a blush near center, dark glossy green leaves #244327.
Pot: medium rounded terracotta, the plant is a rounded compact shrub, not a
single stem.
Mood: recovery after exhaustion, color returning gently, generosity without strain.

```

### 6.9. `king_protea` — Король Протея

```

Plant: Protea cynaroides, king protea.
Visual characteristics: woody shrub with leathery oval silver-green leaves,
huge bowl-shaped flower head up to 30cm across, surrounded by stiff pointed
silvery-pink bracts like a crown, packed cream interior florets, deep
burgundy center.
Color palette: silvery rose-pink #d8a7b1 bracts, cream #f0e8d8 inner florets,
deep burgundy #5a1f2c at the heart, silver-green #8aa090 leaves.
Pot: medium-wide terracotta, ancient feeling.
Mood: ancient strength, monumental maturity, deep roots.

```

### 6.10. `blue_lotus` — Голубой лотос

```

Plant: Nymphaea caerulea, blue Egyptian lotus.
Visual characteristics: a round shallow water dish on top of the terracotta
pot (filled with calm dark water), a single round floating leaf, a tall slender
stem rising above the water with a single star-shaped flower with many narrow
pointed petals.
Color palette: sky blue #6ba6e4 outer petals fading to lavender #b8a6d4,
golden yellow #f0c845 stamens at the center, dark glossy green floating leaf.
Pot: terracotta saucer / shallow bowl that holds water visibly.
Mood: inner silence, mystery, ancient wisdom.

```

### 6.11. `jade_vine` — Нефритовая лоза

```

Plant: Strongylodon macrobotrys, jade vine.
Visual characteristics: woody vine trained on a small wooden support emerging
from the pot, compound green leaves, a single long pendant cluster of many
claw-shaped flowers hanging downward.
Color palette: glowing turquoise-jade #5fd4c4 flowers (almost luminescent),
aqua highlights, dark green #2d4a3c trifoliate leaves.
Pot: medium terracotta with a small wooden trellis emerging.
Mood: wonder of transformation, otherworldly, inner change.

```

### 6.12. `middlemist_red` — Камелия Миддлмист

```

Plant: Camellia "Middlemist's Red", the world's rarest flower.
Visual characteristics: small evergreen shrub with very glossy dark green oval
serrated leaves, single dense rose-like camellia flower with many tightly
packed layered petals in formal double form.
Color palette: rich fuchsia-pink #d4307a with deep magenta shadows #9b1f5a,
hints of cherry red #c12046 in petal centers, glossy dark green #1f3823 leaves.
Pot: classic terracotta, modest size — the flower is the star, not the size.
Mood: pinnacle of the journey, "you arrived", uniqueness, rarity that earned.

```

## 7. Контрольный лист консистентности

Перед утверждением комплекта из 15 стадий одного растения проверь:

- [ ] Canvas is exactly 1024×1024 px before production resizing.
- [ ] Горшок одинаков на всех 15 кадрах: цвет, форма, угол, размер, позиция в кадре, ширина, высота и пропорции.
- [ ] Горшок соответствует эталонной форме plant-set'а, для `orchid` - форме горшка из `plant-03.webp`.
- [ ] Горшок не сплюснут, не растянут по горизонтали, не превращён в низкую миску или кашпо другой формы.
- [ ] Размер горшка держится в диапазоне: верхняя кромка 410-440 px, основание 300-330 px, видимая высота 320-350 px для исходника 1024×1024.
- [ ] Низ горшка стоит на одной baseline-позиции во всех 15 кадрах: bottom edge около Y=994 px, нижний отступ около 30 px, допустимое отклонение не больше 6 px.
- [ ] Центр горшка визуально зафиксирован около X=512 px на всех стадиях.
- [ ] Верхняя точка растения имеет минимум 48 px свободного поля до верхнего края.
- [ ] Финальная стадия не выглядит как close-up: полностью видны растение, цветы и горшок.
- [ ] На поздних стадиях 10-15 полностью видны и верхний цветок, и весь горшок; масштаб/силуэт подстроены под полный кадр.
- [ ] Освещение одинаково на всех 15 кадрах.
- [ ] Тень одинакова (либо везде есть, либо нигде).
- [ ] Размер кадра одинаков (1024×1024 исходник).
- [ ] Растение растёт **плавно**: между соседними кадрами видно изменение, но не скачок.
- [ ] Финальная палитра выдержана на всех стадиях, начиная со стадии 10 (когда бутон формируется в финальной палитре).
- [ ] На стадиях 1-3 нет раскрытых цветков; если видна почва, она нейтральная и не спорит с будущей палитрой.
- [ ] Никаких подписей, водяных знаков, посторонних объектов.
- [ ] Чёткое центрирование (растение в центральной зоне).
- [ ] Прозрачный фон после экспорта (alpha-канал).
- [ ] Вес WebP-файла ≤ 350 KB.

## 8. Альтернативные подходы (если AI-генерация не даёт нужной консистентности)

AI-image-генераторы плохо держат **идентичный горшок и идентичное освещение** между сессиями. Если 15 промптов дают 15 разных горшков или начинают обрезать горшок на поздних стадиях, рассмотри:

1. **Img-to-img от одного reference**: сгенерируй финальный кадр (стадия 15), потом используй его как reference для всех остальных — image-to-image с малой "denoise strength" заставит модель соблюдать форму горшка.
2. **Inpainting**: сгенерируй один кадр с горшком и пустой посадочной зоной, потом inpaint каждую стадию растения отдельно в эту зону.
3. **3D-рендер горшка** + наложение растения: горшок один раз отрисован в 3D, рендерится 15 раз, в каждом — другое растение.
4. **Photoshop-композиция**: один рендер горшка, 15 рендеров растения (без горшка), вручную скомпонованы.

Подход 1-2 — быстро, риск рассинхрона. Подход 3-4 — медленно, идеально. Для P1.5 рекомендую подход 2 (inpainting) — баланс скорости и качества.

## 9. Очерёдность производства

1. **Орхидея (`orchid`)** — ✅ готово, 15 стадий лежат в `public/retention/plant/states/orchid/`. Закреплено за Садом #1 «Спокойствие» (`calm_anxiety_30`).
2. **Пион (`peony`)** — ✅ готово, 15 стадий лежат в `public/retention/plant/states/peony/`. Закреплено за Садом #2 «Доброта к себе» (`self_kindness_21`).
3. **Цикламен персидский (`cyclamen`)** — ✅ готово, 15 стадий лежат в `public/retention/plant/states/cyclamen/`. Закреплено за Садом #3 «Отношения» (`relationships_21`).
4. **Комнатная азалия (`azalea`)** — Сад #4 «Выгорание» (`burnout_21`). Ассеты к генерации.
5. **Тюльпан Queen of Night (`tulip_queen_of_night`)** — Сад #5 «Мягкий сон» (`gentle_sleep_21`).

> Очерёдность синхронизирована с таблицей Садов в `retention_long_term_strategy.md` (она — источник истины). Готовы 3 растения (орхидея, пион, цикламен). Дальше — азалия и тюльпан по мере запуска Садов #4–#5.

Дальше — по мере запуска новых Садов.

## 10. Связь с кодом

Реализовано (сессия 11):

- `app/utils/retentionPlant.ts:getRetentionPlantImageSrc(stateIndex, plantSetSlug?)` принимает slug и возвращает путь `/retention/plant/states/{slug}/plant-NN.webp`.
- `app/components/programs/ProgramStepPlantReward.vue`, `app/components/home/HomeEnergyPlantCard.vue`, `app/components/garden/Garden*.vue` пробрасывают `plantSetSlug` из `ProgramOverviewDto` / `GardenPlantItemDto`.
- Серверный bootstrap (`PROGRAM_BOOTSTRAP['calm_anxiety_30'].plantSetSlug = 'orchid'`) устанавливает значение при первом вызове `/api/today`.
- Backend: поле `plant_set_slug` в `programs`, отдаётся в `ProgramOverviewDto`.

Эти изменения — Этап 2-3 из основного плана в `retention_long_term_strategy.md`.
```
