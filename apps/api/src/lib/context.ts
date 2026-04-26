import PgBoss from 'pg-boss'
import { createAuth, type AuthInstance } from '@workspace/auth/server'
import { createDb, type Database } from '@workspace/db'
import { createMailer, type Mailer } from '@workspace/email'
import { createS3, ensureBucket, type S3 } from '@workspace/media/s3'
import type { MediaEnv } from '@workspace/media/env'
import { loadEnv, type Env } from './env.ts'
import { createCache, type Cache } from './cache.ts'
import { createPubSub, type PubSub } from './pubsub.ts'
import { createLogger, type Logger } from './logger.ts'
import { makeRateLimit } from '@workspace/rate-limit'

export interface AppContext {
  env: Env
  db: Database
  mailer: Mailer
  auth: AuthInstance
  s3: S3
  mediaEnv: MediaEnv
  boss: PgBoss
  cache: Cache
  pubsub: PubSub
  log: Logger
  rateLimit: ReturnType<typeof makeRateLimit>
}

export async function buildContext(): Promise<AppContext> {
  const env = loadEnv()
  const db = createDb(env.DATABASE_URL)

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

  const auth = createAuth({
    db,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
    cookieDomain: env.AUTH_COOKIE_DOMAIN,
    appName: env.APP_NAME,
    sendEmail: async ({ to, subject, template, data }) => {
      await mailer.send({ to, subject, template, data: { ...data, appName: env.APP_NAME } })
    },
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET
      ? { gitlab: { clientId: env.GITLAB_CLIENT_ID, clientSecret: env.GITLAB_CLIENT_SECRET } }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
  })

  const mediaEnv: MediaEnv = {
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: env.S3_BUCKET,
    S3_PUBLIC_URL: env.S3_PUBLIC_URL,
    // Route asset URLs through our signing proxy. The browser hits this URL, the API mints a
    // short-lived signed S3 URL, then 302-redirects. Stable URLs on our domain, private bucket.
    MEDIA_PROXY_BASE: `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/m`,
  }
  const s3 = createS3(mediaEnv)

  // Run on every boot (idempotent): creates the bucket if missing, sets a public-read policy
  // for object GETs, and applies CORS so the browser can upload directly. If you ever migrate
  // to a managed bucket with externally-managed CORS/policy, gate this back to dev.
  await ensureBucket({ s3, bucket: mediaEnv.S3_BUCKET, allowedOrigins: env.AUTH_TRUSTED_ORIGINS })

  const boss = new PgBoss({ connectionString: env.DATABASE_URL })
  boss.on('error', (err) => console.error('pg-boss:', err))
  await boss.start()
  // pg-boss v10 requires a queue to exist before send/work succeeds. Declared serially here
  // so the API can `boss.send` even before the worker has booted; the worker also declares
  // them on its side, which is fine — createQueue is idempotent. Concurrent creates across
  // processes used to deadlock; serial within a process does not.
  await boss.createQueue('email.send')
  await boss.createQueue('media.process')
  await boss.createQueue('github.unfurl')

  const cache = createCache(env.REDIS_URL)
  const pubsub = createPubSub(env.REDIS_URL)
  const log = createLogger(env)
  const rateLimit = makeRateLimit(env.REDIS_URL, log)

  return { env, db, mailer, auth, s3, mediaEnv, boss, cache, pubsub, log, rateLimit }
}
