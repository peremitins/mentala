/**
 * Анти-кэширование HTML-документа.
 *
 * Web — это SPA (`ssr: false`): один index.html отдаётся как fallback на все
 * маршруты и ссылается на хешированные чанки `/_nuxt/*`. Если мобильный
 * браузер закэширует этот HTML, то после деплоя при перезагрузке он подтянет
 * СТАРЫЙ html со ссылками на уже удалённые чанки — и ленивые модули (озвучка
 * практик/медитаций) продолжат падать с 404.
 *
 * Поэтому на любой text/html-ответ выставляем `Cache-Control: no-cache`:
 * браузер обязан ревалидировать документ при каждой загрузке и сразу получит
 * актуальные ссылки на чанки. Хешированные ассеты `/_nuxt/*` мы НЕ трогаем —
 * у них уникальное имя и Nitro отдаёт их `immutable` (это и нужно).
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    // API-ответы не трогаем — у них своя логика кэширования.
    if (event.path?.startsWith('/api/')) return;

    const contentType = getResponseHeader(event, 'content-type');
    const isHtml =
      typeof contentType === 'string' && contentType.includes('text/html');
    if (!isHtml) return;

    setResponseHeader(event, 'cache-control', 'no-cache');
  });
});
