import PgBoss from "pg-boss"
import pino from "pino"
import { createMailer } from "@workspace/email"
import { createDbFromEnv } from "@workspace/db"
import { createS3 } from "@workspace/media/s3"
import type { MediaEnv } from "@workspace/media/env"
import { loadEnv } from "./env.ts"
import { handleEmailJob } from "./jobs/email.ts"
import { handleMediaJob } from "./jobs/media-process.ts"
import { handleApnsSendJob } from "./jobs/apns-send.ts"
import { publishDueScheduledPosts } from "./jobs/publish-scheduled.ts"
import { handleGithubUnfurlJob } from "./jobs/github-unfurl.ts"
import { handleYoutubeUnfurlJob } from "./jobs/youtube-unfurl.ts"
import { handleGenericUnfurlJob } from "./jobs/generic-unfurl.ts"
import { handleXUnfurlJob } from "./jobs/x-unfurl.ts"

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

const boss = new PgBoss({ connectionString: env.DATABASE_URL })
boss.on("error", (err) => log.error({ err: err.message }, "pg_boss_error"))

await boss.start()
await boss.createQueue("email.send")
await boss.createQueue("media.process")
await boss.createQueue("github.unfurl")
await boss.createQueue("youtube.unfurl")
await boss.createQueue("generic.unfurl")
await boss.createQueue("x.unfurl")
await boss.createQueue("apns.send")

await boss.work("email.send", { batchSize: 5 }, async (jobs) => {
  await Promise.all(jobs.map((job) => handleEmailJob(mailer, job.data)))
})

await boss.work("media.process", { batchSize: 2 }, async (jobs) => {
  for (const job of jobs) {
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
        "media_process_failed"
      )
      throw err
    }
  }
})

await boss.work("github.unfurl", { batchSize: 4 }, async (jobs) => {
  for (const job of jobs) {
    try {
      const result = await handleGithubUnfurlJob(db, job.data)
      if (!result.ok) {
        log.warn({ payload: job.data, reason: result.reason }, "github_unfurl_failed")
      }
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? (err.stack ?? err.message) : err,
          payload: job.data,
        },
        "github_unfurl_handler_error"
      )
    }
  }
})

await boss.work("youtube.unfurl", { batchSize: 4 }, async (jobs) => {
  for (const job of jobs) {
    try {
      const result = await handleYoutubeUnfurlJob(db, job.data, env.YOUTUBE_API_KEY)
      if (!result.ok) {
        log.warn({ payload: job.data, reason: result.reason }, "youtube_unfurl_failed")
      }
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? (err.stack ?? err.message) : err,
          payload: job.data,
        },
        "youtube_unfurl_handler_error"
      )
    }
  }
})

await boss.work("generic.unfurl", { batchSize: 4 }, async (jobs) => {
  for (const job of jobs) {
    try {
      const result = await handleGenericUnfurlJob(db, job.data)
      if (!result.ok) {
        log.warn({ payload: job.data, reason: result.reason }, "generic_unfurl_failed")
      }
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? (err.stack ?? err.message) : err,
          payload: job.data,
        },
        "generic_unfurl_handler_error"
      )
    }
  }
})

await boss.work("x.unfurl", { batchSize: 4 }, async (jobs) => {
  for (const job of jobs) {
    try {
      const result = await handleXUnfurlJob(db, job.data, env.FXTWITTER_API_BASE_URL)
      if (!result.ok) {
        log.warn({ payload: job.data, reason: result.reason }, "x_unfurl_failed")
      }
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? (err.stack ?? err.message) : err,
          payload: job.data,
        },
        "x_unfurl_handler_error"
      )
    }
  }
})

await boss.work("apns.send", { batchSize: 10 }, async (jobs) => {
  for (const job of jobs) {
    try {
      await handleApnsSendJob(db, env, job.data, log)
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? (err.stack ?? err.message) : err,
          payload: job.data,
        },
        "apns_send_handler_error",
      )
    }
  }
})

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
      "apns.send",
    ],
    scheduledIntervalMs: SCHEDULED_INTERVAL_MS,
  },
  "worker_ready",
)

const shutdown = async () => {
  log.info("worker_shutdown")
  clearInterval(scheduledTimer)
  await boss.stop({ graceful: true })
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
