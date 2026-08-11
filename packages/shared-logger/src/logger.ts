import pino, {
  type Logger
} from "pino";

export interface LoggerOptions {

  service: string;

  version?: string;

  environment?: string;

}

export function createLogger(
  options: LoggerOptions
): Logger {

  return pino({

    level:
      process.env.LOG_LEVEL ??
      "info",

    base: {

      service:
        options.service,

      version:
        options.version ??
        "dev",

      environment:
        options.environment ??
        process.env.NODE_ENV ??
        "development"

    }

  });

}
