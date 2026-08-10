export interface IncomingMessage {
  source: string;
  topic: string;
  payload: Buffer;
  receivedAt: Date;
}