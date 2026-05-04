import PgBoss from "pg-boss"
import { createAuth, type AuthInstance } from "@workspace/auth/server"
import { createDb, type Database } from "@workspace/db"
import { createMailer, type Mailer } from "@workspace/email"
import { createS3, ensureBucket, type S3 } from "@workspace/media/s3"
import type { MediaEnv } from "@workspace/media/env"
import { loadEnv, type Env } from "./env.ts"
import { createCache, type Cache } from "./cache.ts"
import { createPubSub, type PubSub } from "./pubsub.ts"
import { createLogger, type Logger } from "./logger.ts"
import { makeRateLimit } from "@workspace/rate-limit"
import { createTracker, type TrackFn } from "./analytics.ts"
import { createModerator, type Moderator } from "./moderation.ts"

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
  track: TrackFn
  moderate: Moderator
}

export async function buildContext(): Promise<AppContext> {
  const env = loadEnv()
  const db = createDb(env.DATABASE_URL)
  const log = createLogger(env)

  const mailer = createMailer({
    from: env.EMAIL_FROM,
    resendApiKey: env.RESEND_API_KEY,
  })

  const auth = createAuth({
    db,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
    cookieDomain: env.AUTH_COOKIE_DOMAIN,
    appName: env.APP_NAME,
    passkeyRpId: env.PASSKEY_RP_ID,
    sendEmail: async ({ to, subject, template, data }) => {
      if (env.NODE_ENV !== "production") {
        const url = typeof data.url === "string" ? data.url : null
        const maskedTo = to.replace(/^(.).*(@.*)$/, "$1***$2")
        log.info({ to: maskedTo, subject, template, url }, "email_dev_console")
        return
      }
      await mailer.send({
        to,
        subject,
        template,
        data: { ...data, appName: env.APP_NAME },
      })
    },
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET
      ? {
          gitlab: {
            clientId: env.GITLAB_CLIENT_ID,
            clientSecret: env.GITLAB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  })

  const mediaEnv: MediaEnv = {
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: env.S3_BUCKET,
    S3_PUBLIC_URL: env.S3_PUBLIC_URL,
    MEDIA_PROXY_BASE: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/m`,
  }
  const s3 = createS3(mediaEnv)

  await ensureBucket({
    s3,
    bucket: mediaEnv.S3_BUCKET,
    allowedOrigins: env.AUTH_TRUSTED_ORIGINS,
  })

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

  const cache = createCache(env.REDIS_URL)
  const pubsub = createPubSub(env.REDIS_URL)
  const rateLimit = makeRateLimit(env.REDIS_URL, log)
  const track = createTracker(
    env.DATABUDDY_API_KEY,
    env.DATABUDDY_WEBSITE_ID,
    log
  )
  const moderate = createModerator(env, log)

  return {
    env,
    db,
    mailer,
    auth,
    s3,
    mediaEnv,
    boss,
    cache,
    pubsub,
    log,
    rateLimit,
    track,
    moderate,
  }
}
