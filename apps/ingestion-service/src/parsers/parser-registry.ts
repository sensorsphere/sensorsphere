import type {
  IncomingMessage
} from "../domain/incoming-message.js";

import type {
  ParsedMeasurement
} from "../domain/parsed-measurement.js";

import type {
  Parser
} from "../domain/parser.js";

export class ParserRegistry {

  constructor(
    private readonly parsers: Parser[]
  ) {}

  parse(
    message: IncomingMessage
  ): ParsedMeasurement[] {

    for (const parser of this.parsers) {

      if (
        parser.canParse(message)
      ) {
        return parser.parse(message);
      }
    }

    return [];
  }
}