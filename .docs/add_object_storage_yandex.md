

ТЗ: Перевод медиа медитаций на Yandex Object Storage (без public/)

1) Цель
	•	Все аудио/обложки/фоны медитаций должны загружаться только по внешнему base URL (Object Storage + CDN + домен media.mentala.app).
	•	Локальная папка public/meditations/** больше не используется как источник для продакшена.

⸻

2) Текущее состояние
	•	В БД (и в сидере) поля audioPath / coverPath / backgroundPath хранят путь от корня, например:
	•	/meditations/audio/nature/rain-night.m4a
	•	/meditations/covers/rain-night.webp
	•	/meditations/backgrounds/rain-night.webp
	•	В коде логика тем:
	•	topicKey — обязателен
	•	topicKeys?: string[] — опционален и используется для отображения трека в нескольких темах

⸻

3) Новое поведение

3.1 Источник медиа
	•	Вся загрузка медиа идёт по:
	•	NUXT_PUBLIC_MEDIA_BASE_URL + <path> (из runtimeConfig.public.mediaBaseUrl)
	•	Пример:
	•	https://media.mentala.app + /meditations/audio/music/healing-piano.m4a
→ https://media.mentala.app/meditations/audio/music/healing-piano.m4a

3.2 Хранение путей в БД
	•	Не меняем схему хранения: в БД остаются относительные пути вида /meditations/...
	•	Меняем только то, как приложение превращает путь в URL.

⸻

4) Изменения в кодовой базе

4.1 Конфигурация окружения

Добавить переменную окружения (обязательная):
	•	NUXT_PUBLIC_MEDIA_BASE_URL=https://media.mentala.app

Где хранить:
	•	.env.development (если хочешь тестировать)
	•	.env / .env.production для продакшена
	
Примечание: значение не может быть пустым, в проде по умолчанию https://media.mentala.app.

4.2 Nuxt runtimeConfig

Добавить в nuxt.config:
	•	runtimeConfig.public.mediaBaseUrl = process.env.NUXT_PUBLIC_MEDIA_BASE_URL ?? ''

Требование: mediaBaseUrl должен быть доступен на клиенте (public).

4.3 Единая функция построения URL

Добавить утилиту (например shared/lib/mediaUrl.ts или shared/utils/media.ts):

Поведение:
	•	принимает path: string | null | undefined
	•	если path уже абсолютный (http:// или https://) → вернуть как есть
	•	если path начинается с / → вернуть ${mediaBaseUrl}${path}
	•	если path пустой → вернуть пустую строку
	•	если mediaBaseUrl пустой → логировать ошибку и вернуть пустую строку (локальные пути не использовать)

Важно: убрать двойные слэши (https://...//meditations/...) — нормализовать.

4.4 Применить утилиту во всех местах UI

Обязательные точки:
	•	карточки треков (cover/background)
	•	экран плеера (cover/background)
	•	сам аудио-источник (<audio src="..."> или player)

Цель: в UI и плеере не должно остаться прямых ссылок на /meditations/... без mediaBaseUrl.
Примечание: меняем только фронт, API продолжает отдавать относительные пути.

4.5 Разделы и фильтрация по темам (topicKey + topicKeys)

Логика отображения секций:

Трек принадлежит теме X, если:
	•	track.topicKey === X ИЛИ
	•	track.topicKeys?.includes(X) === true

При этом:
	•	topicKeys может отсутствовать — это нормальный кейс
	•	topicKey обязателен всегда

4.6 Убрать зависимость от public/meditations 
	•	удалить public/meditations/** из проекта (или не включать в билд)
	•	локально для разработки тоже использовать CDN

⸻

5) Критерии приёмки
	1.	В прод окружении приложение работает без папки public/meditations/**, NUXT_PUBLIC_MEDIA_BASE_URL не пустой.
	2.	Любой трек воспроизводится, а cover/background загружаются по https://media.mentala.app/....
	3.	Треки с topicKeys отображаются в обеих темах.
	4.	Треки без topicKeys отображаются только по topicKey.
	5.	В Network (DevTools) нет запросов вида:
	•	https://dev.mentala.app/meditations/... (локальный домен приложения)
	•	или http(s)://localhost/meditations/...
	•	только https://media.mentala.app/...
