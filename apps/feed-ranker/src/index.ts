import { Hono } from "hono"
import Redis from "ioredis"
import { z } from "zod"
import { createDb, sql } from "@workspace/db"
import {
  FOR_YOU_ALGO_VERSION,
  FOR_YOU_VARIANTS,
  type ForYouRankRequest,
} from "@workspace/types"
import { loadEnv } from "./env.ts"
import { createLogger } from "./lib/logger.ts"
import { runForYouPipeline, type RankerRuntime } from "./lib/pipeline.ts"

const rankRequestSchema = z.object({
  userId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200),
  cursor: z.string().min(1).nullable().optional(),
  algoVersion: z.literal(FOR_YOU_ALGO_VERSION),
  variant: z.enum(FOR_YOU_VARIANTS),
})

const env = loadEnv()
const log = createLogger(env)
const db = createDb(env.DATABASE_URL, { max: env.DB_POOL_MAX })
const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
})

redis.on("error", (err) => {
  log.warn({ err: err.message }, "redis_error")
})

const runtime: RankerRuntime = { env, db, redis, log }
const app = new Hono()

app.use("*", async (c, next) => {
  const start = Date.now()
  await next()
  const path = c.req.path
  if (path === "/healthz" || path === "/readyz") return
  log.info(
    { method: c.req.method, path, status: c.res.status, ms: Date.now() - start },
    "req"
  )
})

app.get("/healthz", (c) => c.json({ ok: true }))

app.get("/readyz", async (c) => {
  try {
    await db.execute(sql`SELECT 1`)
    await redis.ping()
    return c.json({ ok: true })
  } catch (err) {
    log.error({ err: errMsg(err) }, "readyz_failed")
    return c.json({ ok: false, error: "dependency_unreachable" }, 503)
  }
})

app.use("/internal/*", async (c, next) => {
  const authorization = c.req.header("authorization") ?? ""
  if (authorization !== `Bearer ${env.INTERNAL_SERVICE_TOKEN}`) {
    return c.json({ error: "unauthorized" }, 401)
  }
  await next()
})

app.post("/internal/for-you", async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = rankRequestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten().fieldErrors }, 400)
  }

  const response = await runForYouPipeline(runtime, parsed.data satisfies ForYouRankRequest)
  return c.json(response)
})

app.notFound((c) => c.json({ error: "not_found" }, 404))
app.onError((err, c) => {
  log.error({ err: err.stack ?? err.message, path: c.req.path }, "unhandled_error")
  return c.json({ error: "internal_error" }, 500)
})

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const shutdown = () => {
  log.info("feed_ranker_shutdown")
  redis.disconnect()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

log.info({ port: env.PORT }, "feed_ranker_listening")
export default { port: env.PORT, fetch: app.fetch }
