import type { Database } from "@workspace/db"
import type Redis from "ioredis"
import type { Env } from "../env.ts"
import type { Logger } from "./logger.ts"

export interface RankerRuntime {
  env: Env
  db: Database
  redis: Redis
  log: Logger
}
