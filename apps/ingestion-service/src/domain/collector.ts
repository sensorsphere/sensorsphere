import type {
  IncomingMessage
} from "./incoming-message.js";

export type MessageHandler =
  (message: IncomingMessage) => void | Promise<void>;

export interface Collector {
  readonly id: string;

  start(
    handler: MessageHandler
  ): Promise<void>;

  stop(): Promise<void>;
}