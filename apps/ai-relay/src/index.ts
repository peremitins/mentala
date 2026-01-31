import { config } from './config.js';
import { buildServer } from './server.js';

async function startServer() {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  try {
    app = await buildServer();
    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ address }, 'ai-relay started');
  } catch (err) {
    // Явно логируем ошибку старта, чтобы причина не терялась в логах.
    if (app) {
      app.log.error({ err }, 'ai-relay failed to start');
    } else {
      console.error('ai-relay failed to start', err);
    }
    process.exit(1);
  }
}

void startServer();
