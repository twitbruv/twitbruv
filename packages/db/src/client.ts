import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.ts'

export type Database = ReturnType<typeof createDb>
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export interface CreateDbOptions {
  /** Max concurrent connections in the pool. Default: DB_POOL_MAX env or 30. */
  max?: number
  /** Seconds a pooled connection can sit idle before being closed. Default 20. */
  idleTimeoutSec?: number
  /** Seconds a single connection will live before being recycled. Default 1800 (30 min). */
  maxLifetimeSec?: number
  /** Seconds to wait for a new connection before failing. Default 10. */
  connectTimeoutSec?: number
  /** Use prepared statements. Turn off when running behind PgBouncer in transaction mode. */
  prepare?: boolean
}

function intEnv(key: string, fallback: number) {
  const raw = process.env[key]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function createDb(url: string, opts: CreateDbOptions = {}) {
  const client = postgres(url, {
    max: opts.max ?? intEnv('DB_POOL_MAX', 30),
    idle_timeout: opts.idleTimeoutSec ?? intEnv('DB_POOL_IDLE_TIMEOUT_SEC', 20),
    max_lifetime: opts.maxLifetimeSec ?? intEnv('DB_POOL_MAX_LIFETIME_SEC', 60 * 30),
    connect_timeout: opts.connectTimeoutSec ?? intEnv('DB_POOL_CONNECT_TIMEOUT_SEC', 10),
    prepare: opts.prepare ?? (process.env.DB_PREPARE !== 'false'),
  })
  return drizzle(client, { schema, casing: 'snake_case' })
}

export function createDbFromEnv() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return createDb(url)
}
