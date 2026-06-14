/**
 * Cloudflare Worker — прокси к Telegram Bot API.
 *
 * Зачем: в РФ api.telegram.org блокируется с серверных IP (DNS + DPI), из-за
 * чего уведомления в Telegram с прод-сервера падают по таймауту. Воркер живёт
 * на инфраструктуре Cloudflare (вне РФ) и просто переадресует запросы на
 * api.telegram.org, сохраняя путь, метод, заголовки и тело.
 *
 * В приложении меняется только хост: вместо api.telegram.org указываем хост
 * этого воркера в переменной NUXT_TELEGRAM_API_BASE_HOST.
 *
 * Безопасность: токен бота идёт в пути (/bot<token>/...). Воркер ничего не
 * логирует и не хранит — он только проксирует. Пропускаем лишь пути /bot…,
 * чтобы воркер нельзя было использовать как открытый прокси к чему-то ещё.
 *
 * Деплой:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Вставить этот код, Deploy
 *   3. Скопировать адрес вида  <name>.<subdomain>.workers.dev
 *   4. На сервере в .env:  NUXT_TELEGRAM_API_BASE_HOST=<name>.<subdomain>.workers.dev
 */

const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Пропускаем только Telegram Bot API пути, остальное — 404.
    if (!url.pathname.startsWith('/bot')) {
      return new Response('Not found', { status: 404 });
    }

    const target = TELEGRAM_API_ORIGIN + url.pathname + url.search;

    // redirect: 'manual' — не даём воркеру самому ходить по редиректам.
    const proxied = new Request(target, {
      method: request.method,
      headers: request.headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
      redirect: 'manual',
    });

    return fetch(proxied);
  },
};
