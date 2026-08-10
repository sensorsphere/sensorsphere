import type {
  IncomingMessage
} from "./incoming-message.js";

import type {
  ParsedMeasurement
} from "./parsed-measurement.js";

export interface Parser {
  readonly id: string;

  canParse(
    message: IncomingMessage
  ): boolean;

  parse(
    message: IncomingMessage
  ): ParsedMeasurement[];
}