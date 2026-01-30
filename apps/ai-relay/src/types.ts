export type RelayPurpose =
  | 'chat'
  | 'chat_stream'
  | 'chips'
  | 'finish_session'
  | 'notification'
  | 'other';

export type StreamEvent = {
  type: 'raw';
  data: Buffer;
};
