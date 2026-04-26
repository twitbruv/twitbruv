import PgBoss from 'pg-boss'
import pino from 'pino'
import { createMailer } from '@workspace/email'
import { createDbFromEnv } from '@workspace/db'
import { createS3 } from '@workspace/media/s3'
import type { MediaEnv } from '@workspace/media/env'
import { loadEnv } from './env.ts'
import { handleEmailJob } from './jobs/email.ts'
import { handleMediaJob } from './jobs/media-process.ts'
import { publishDueScheduledPosts } from './jobs/publish-scheduled.ts'
import { handleGithubUnfurlJob } from './jobs/github-unfurl.ts'

const env = loadEnv()

const log = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'production'
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
})

const mailer = createMailer({
  from: env.EMAIL_FROM,
  provider: env.EMAIL_PROVIDER,
  resendApiKey: env.RESEND_API_KEY,
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
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
boss.on('error', (err) => log.error({ err: err.message }, 'pg_boss_error'))

await boss.start()
// pg-boss v10 needs queues declared before work/send. Idempotent.
// Serialize: creating two queues in parallel deadlocks on pgboss.queue row locks.
await boss.createQueue('email.send')
await boss.createQueue('media.process')
await boss.createQueue('github.unfurl')

await boss.work('email.send', { batchSize: 5 }, async (jobs) => {
  await Promise.all(jobs.map((job) => handleEmailJob(mailer, job.data)))
})

await boss.work('media.process', { batchSize: 2 }, async (jobs) => {
  for (const job of jobs) {
    log.info({ payload: job.data }, 'media_process_start')
    try {
      await handleMediaJob({ db, s3, env: mediaEnv, payload: job.data })
      log.info({ payload: job.data }, 'media_process_done')
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.stack ?? err.message : err, payload: job.data },
        'media_process_failed',
      )
      throw err
    }
  }
})

// GitHub URL unfurl. batchSize=4 caps concurrent GitHub RTTs at 4 per worker tick — at
// ~500ms p50, that's ~8 RPS max, far under the 5000/hr authenticated limit. Most jobs are
// cache hits anyway because url_unfurls.refKey dedupes across posters.
await boss.work('github.unfurl', { batchSize: 4 }, async (jobs) => {
  for (const job of jobs) {
    try {
      const result = await handleGithubUnfurlJob(db, job.data)
      if (!result.ok) {
        log.warn({ payload: job.data, reason: result.reason }, 'github_unfurl_failed')
      }
    } catch (err) {
      // The handler persists most failures itself; only programmer errors reach here. Don't
      // re-throw — pg-boss would retry, and a parse error isn't going to fix itself.
      log.error(
        { err: err instanceof Error ? err.stack ?? err.message : err, payload: job.data },
        'github_unfurl_handler_error',
      )
    }
  }
})

// Polls every 30s for scheduled posts whose publish time has arrived. Cheap query, indexed.
// Runs in-process rather than via pg-boss because it doesn't need durability or fan-out — it
// just walks the table.
const SCHEDULED_INTERVAL_MS = 30_000
let scheduledRunning = false
const scheduledTimer = setInterval(async () => {
  if (scheduledRunning) return
  scheduledRunning = true
  try {
    const n = await publishDueScheduledPosts(db)
    if (n > 0) log.info({ published: n }, 'scheduled_posts_published')
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, 'scheduled_posts_failed')
  } finally {
    scheduledRunning = false
  }
}, SCHEDULED_INTERVAL_MS)

log.info(
  { queues: ['email.send', 'media.process', 'github.unfurl'], scheduledIntervalMs: SCHEDULED_INTERVAL_MS },
  'worker_ready',
)

const shutdown = async () => {
  log.info('worker_shutdown')
  clearInterval(scheduledTimer)
  await boss.stop({ graceful: true })
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
