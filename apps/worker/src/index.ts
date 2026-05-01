import { Worker } from "bullmq"
import pino from "pino"
import { createMailer } from "@workspace/email"
import { createDbFromEnv } from "@workspace/db"
import { createS3 } from "@workspace/media/s3"
import type { MediaEnv } from "@workspace/media/env"
import { loadEnv } from "./env.ts"
import { handleEmailJob } from "./jobs/email.ts"
import { handleMediaJob } from "./jobs/media-process.ts"
import { publishDueScheduledPosts } from "./jobs/publish-scheduled.ts"
import { handleGithubUnfurlJob } from "./jobs/github-unfurl.ts"
import { handleYoutubeUnfurlJob } from "./jobs/youtube-unfurl.ts"
import { handleGenericUnfurlJob } from "./jobs/generic-unfurl.ts"
import { handleXUnfurlJob } from "./jobs/x-unfurl.ts"

const BULLMQ_PREFIX = "twotter:queue"

const env = loadEnv()

const log = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "production"
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
})

const mailer = createMailer({
  from: env.EMAIL_FROM,
  resendApiKey: env.RESEND_API_KEY,
})

const db = createDbFromEnv()
const mediaEnv: MediaEnv = {
  S3_ENDPOINT: env.S3_ENDPOINT,
  S3_REGION: env.S3_REGION,
  S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
  S3_BUCKET: env.S3_BUCKET,
  S3_PUBLIC_URL: env.S3_PUBLIC_URL,
}
const s3 = createS3(mediaEnv)

const connection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null as null,
}

const workerOpts = { connection, prefix: BULLMQ_PREFIX }

const workers: Worker[] = [
  new Worker(
    "email.send",
    async (job) => {
      await handleEmailJob(mailer, job.data)
    },
    { ...workerOpts, concurrency: 5 },
  ),

  new Worker(
    "media.process",
    async (job) => {
      log.info({ payload: job.data }, "media_process_start")
      try {
        await handleMediaJob({ db, s3, env: mediaEnv, payload: job.data })
        log.info({ payload: job.data }, "media_process_done")
      } catch (err) {
        log.error(
          {
            err: err instanceof Error ? (err.stack ?? err.message) : err,
            payload: job.data,
          },
          "media_process_failed",
        )
        throw err
      }
    },
    { ...workerOpts, concurrency: 2 },
  ),

  new Worker(
    "github.unfurl",
    async (job) => {
      try {
        const result = await handleGithubUnfurlJob(db, job.data)
        if (!result.ok) {
          log.warn(
            { payload: job.data, reason: result.reason },
            "github_unfurl_failed",
          )
        }
      } catch (err) {
        log.error(
          {
            err: err instanceof Error ? (err.stack ?? err.message) : err,
            payload: job.data,
          },
          "github_unfurl_handler_error",
        )
      }
    },
    { ...workerOpts, concurrency: 4 },
  ),

  new Worker(
    "youtube.unfurl",
    async (job) => {
      try {
        const result = await handleYoutubeUnfurlJob(
          db,
          job.data,
          env.YOUTUBE_API_KEY,
        )
        if (!result.ok) {
          log.warn(
            { payload: job.data, reason: result.reason },
            "youtube_unfurl_failed",
          )
        }
      } catch (err) {
        log.error(
          {
            err: err instanceof Error ? (err.stack ?? err.message) : err,
            payload: job.data,
          },
          "youtube_unfurl_handler_error",
        )
      }
    },
    { ...workerOpts, concurrency: 4 },
  ),

  new Worker(
    "generic.unfurl",
    async (job) => {
      try {
        const result = await handleGenericUnfurlJob(db, job.data)
        if (!result.ok) {
          log.warn(
            { payload: job.data, reason: result.reason },
            "generic_unfurl_failed",
          )
        }
      } catch (err) {
        log.error(
          {
            err: err instanceof Error ? (err.stack ?? err.message) : err,
            payload: job.data,
          },
          "generic_unfurl_handler_error",
        )
      }
    },
    { ...workerOpts, concurrency: 4 },
  ),

  new Worker(
    "x.unfurl",
    async (job) => {
      try {
        const result = await handleXUnfurlJob(
          db,
          job.data,
          env.FXTWITTER_API_BASE_URL,
        )
        if (!result.ok) {
          log.warn(
            { payload: job.data, reason: result.reason },
            "x_unfurl_failed",
          )
        }
      } catch (err) {
        log.error(
          {
            err: err instanceof Error ? (err.stack ?? err.message) : err,
            payload: job.data,
          },
          "x_unfurl_handler_error",
        )
      }
    },
    { ...workerOpts, concurrency: 4 },
  ),
]

for (const w of workers) {
  w.on("error", (err) =>
    log.error({ err: err instanceof Error ? err.message : err }, "bullmq_error"),
  )
}

const SCHEDULED_INTERVAL_MS = 30_000
let scheduledRunning = false
const scheduledTimer = setInterval(async () => {
  if (scheduledRunning) return
  scheduledRunning = true
  try {
    const n = await publishDueScheduledPosts(db)
    if (n > 0) log.info({ published: n }, "scheduled_posts_published")
  } catch (err) {
    log.error({ err }, "scheduled_posts_failed")
  } finally {
    scheduledRunning = false
  }
}, SCHEDULED_INTERVAL_MS)

log.info(
  {
    queues: [
      "email.send",
      "media.process",
      "github.unfurl",
      "youtube.unfurl",
      "generic.unfurl",
      "x.unfurl",
    ],
    scheduledIntervalMs: SCHEDULED_INTERVAL_MS,
  },
  "worker_ready",
)

const shutdown = async () => {
  log.info("worker_shutdown")
  clearInterval(scheduledTimer)
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
