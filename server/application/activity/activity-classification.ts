import type {
  ActivityPingEventType,
  ActivityPingSourceType,
} from '../../../shared/dto/activity';

export function shouldUpdateLastSeenForActivity(params: {
  event: ActivityPingEventType;
  clientVisible?: boolean;
  clientFocused?: boolean;
  source?: ActivityPingSourceType;
  recentPushWakeWithoutOpen?: boolean;
}): boolean {
  if (params.source === 'notification_click') {
    return true;
  }

  if (params.recentPushWakeWithoutOpen) {
    return false;
  }

  if (params.event === 'startup') {
    return true;
  }

  if (params.event !== 'foreground' && params.event !== 'heartbeat') {
    return false;
  }

  // Для web/PWA push может разбудить скрытую страницу и спровоцировать lifecycle ping.
  // Засчитываем возврат только когда сам клиент подтверждает видимость и фокус.
  return params.clientVisible === true && params.clientFocused === true;
}
