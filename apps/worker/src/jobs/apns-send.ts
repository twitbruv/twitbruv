import http2 from "node:http2"
import { SignJWT, importPKCS8 } from "jose"
import { and, eq, schema } from "@workspace/db"
import type { Database } from "@workspace/db"
import type { Logger } from "pino"
import { z } from "zod"
import type { Env } from "../env.ts"

const jobSchema = z.object({
  userId: z.string().uuid(),
  kind: z.enum(schema.notificationKindEnum.enumValues),
  title: z.string(),
  body: z.string(),
  deepLink: z.string(),
})

export type ApnsSendJobValidated = z.infer<typeof jobSchema>

function normalizeP8(raw: string): string {
  const s = raw.replace(/\\n/g, "\n").trim()
  if (s.includes("BEGIN PRIVATE KEY")) return s
  return `-----BEGIN PRIVATE KEY-----\n${s}\n-----END PRIVATE KEY-----`
}

let cachedToken: { value: string; exp: number } | null = null

function apnsHost(env: Env): string {
  return env.APNS_ENVIRONMENT === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com"
}

async function providerJwt(env: Env): Promise<string | null> {
  const kid = env.APNS_KEY_ID?.trim()
  const iss = env.APNS_TEAM_ID?.trim()
  const p8 = env.APNS_KEY_P8?.trim()
  if (!kid || !iss || !p8) return null

  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value

  const pem = normalizeP8(p8)
  const key = await importPKCS8(pem, "ES256")
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(iss)
    .setIssuedAt(now)
    .setExpirationTime(now + 3500)
    .sign(key)

  cachedToken = { value: jwt, exp: now + 3300 }
  return jwt
}

export function shouldDeleteToken(
  status: number,
  reason: string | undefined
): boolean {
  const r = reason ?? ""
  return r === "BadDeviceToken" || r === "Unregistered"
}

async function sendOne(
  env: Env,
  deviceToken: string,
  job: ApnsSendJobValidated,
  bundleId: string,
  log: Logger
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const auth = await providerJwt(env)
  if (!auth) return { ok: false, status: 0, reason: "apns_not_configured" }

  const host = apnsHost(env)
  const payload = JSON.stringify({
    aps: {
      alert: { title: job.title, body: job.body },
      sound: "default",
    },
    deepLink: job.deepLink,
  })

  return await new Promise((resolve) => {
    const client = http2.connect(`https://${host}`)
    const timer = setTimeout(() => {
      client.close()
      resolve({ ok: false, status: 0, reason: "timeout" })
    }, 15000)

    client.on("error", (err) => {
      clearTimeout(timer)
      client.close()
      resolve({ ok: false, status: 0, reason: err.message })
    })

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      authorization: `bearer ${auth}`,
      "content-type": "application/json",
    })

    let status = 0
    let buf = ""

    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0)
    })

    req.on("data", (chunk) => {
      buf += chunk.toString()
    })

    req.on("end", () => {
      clearTimeout(timer)
      client.close()
      let reason: string | undefined
      try {
        const j = JSON.parse(buf) as { reason?: string }
        reason = j.reason
      } catch {
        /* ignore */
      }
      if (status !== 200) {
        log.warn(
          { status, reason, tokenTail: deviceToken.slice(-8) },
          "apns_send_response"
        )
      }
      resolve({ ok: status === 200, status, reason })
    })

    req.on("error", (err) => {
      clearTimeout(timer)
      client.close()
      resolve({ ok: false, status: 0, reason: err.message })
    })

    req.end(payload, "utf8")
  })
}

export async function handleApnsSendJob(
  db: Database,
  env: Env,
  raw: unknown,
  log: Logger
): Promise<void> {
  const parsed = jobSchema.safeParse(raw)
  if (!parsed.success) {
    log.warn({ err: parsed.error.flatten() }, "apns_job_invalid")
    return
  }
  const job = parsed.data

  if (!env.APNS_BUNDLE_ID?.trim() || !env.APNS_ENVIRONMENT) {
    log.warn("apns_skip_incomplete_env")
    return
  }

  const tokens = await db
    .select()
    .from(schema.deviceTokens)
    .where(
      and(
        eq(schema.deviceTokens.userId, job.userId),
        eq(schema.deviceTokens.bundleId, env.APNS_BUNDLE_ID),
        eq(schema.deviceTokens.environment, env.APNS_ENVIRONMENT)
      )
    )

  if (tokens.length === 0) return

  for (const row of tokens) {
    const r = await sendOne(env, row.token, job, env.APNS_BUNDLE_ID, log)
    if (!r.ok && shouldDeleteToken(r.status, r.reason)) {
      await db
        .delete(schema.deviceTokens)
        .where(
          and(
            eq(schema.deviceTokens.token, row.token),
            eq(schema.deviceTokens.bundleId, env.APNS_BUNDLE_ID),
            eq(schema.deviceTokens.environment, row.environment)
          )
        )
      log.info(
        { tokenTail: row.token.slice(-8), reason: r.reason },
        "apns_token_pruned"
      )
    }
  }
}
