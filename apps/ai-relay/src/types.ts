export type RelayPurpose =
  | 'chat'
  | 'chat_stream'
  | 'chips'
  | 'finish_session'
  | 'notification'
  | 'realtime_call'
  | 'other';

export type StreamEvent = {
  type: 'raw';
  data: Buffer;
};

export type RelayRealtimeCallBody = {
  sdp: string;
  session?: Record<string, unknown> | null;
  clientSecret?: string | null;
};
