import pino from "pino"
import type { Env } from "../env.ts"

export function createLogger(env: Env) {
  return pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  })
}

export type Logger = ReturnType<typeof createLogger>
