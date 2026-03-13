import { EventEmitter } from 'node:events';
import type {
  MentalaAppEventMap,
  MentalaAppEventName,
} from './app-events.types';

type AppEventHandler<TEventName extends MentalaAppEventName> = (
  payload: MentalaAppEventMap[TEventName]
) => void | Promise<void>;

const appEventBus = new EventEmitter();

// В проекте подписчиков немного, но лимит поднимаем заранее,
// чтобы без шума масштабировать интеграции поверх общего bus.
appEventBus.setMaxListeners(50);

function scheduleEventDispatch(task: () => void): void {
  if (typeof setImmediate === 'function') {
    setImmediate(task);
    return;
  }

  queueMicrotask(task);
}

export function emitAppEvent<TEventName extends MentalaAppEventName>(
  eventName: TEventName,
  payload: MentalaAppEventMap[TEventName]
): boolean {
  return appEventBus.emit(eventName, payload);
}

export function dispatchAppEvent<TEventName extends MentalaAppEventName>(
  eventName: TEventName,
  payload: MentalaAppEventMap[TEventName]
): void {
  scheduleEventDispatch(() => {
    emitAppEvent(eventName, payload);
  });
}

export function subscribeToAppEvent<TEventName extends MentalaAppEventName>(
  eventName: TEventName,
  handler: AppEventHandler<TEventName>
): () => void {
  const wrappedHandler = (payload: MentalaAppEventMap[TEventName]) => {
    try {
      const result = handler(payload);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch((error) => {
          console.error(`[App Events] Handler failed for ${eventName}:`, error);
        });
      }
    } catch (error) {
      console.error(`[App Events] Handler failed for ${eventName}:`, error);
    }
  };

  appEventBus.on(eventName, wrappedHandler);

  return () => {
    appEventBus.off(eventName, wrappedHandler);
  };
}

// Нужен только для unit/integration tests, чтобы сбрасывать process-local listeners.
export function clearAppEventBusListenersForTests(): void {
  appEventBus.removeAllListeners();
}
