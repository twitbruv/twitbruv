import { z } from "zod"

const DEFAULT_AUTH_TRUSTED_ORIGINS =
  "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"

function expandLocalDevOrigins(origins: string[], nodeEnv: string): string[] {
  if (nodeEnv !== "development") {
    return origins
  }
  const ports = [3000, 3001, 3002, 5173, 5174, 4173, 8080]
  const extra: string[] = []
  for (const p of ports) {
    extra.push(`http://localhost:${p}`, `http://127.0.0.1:${p}`)
  }
  return [...new Set([...origins, ...extra])]
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
  AUTH_TRUSTED_ORIGINS: z
    .string()
    .default(DEFAULT_AUTH_TRUSTED_ORIGINS)
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  PASSKEY_RP_ID: z.optional(
    z.preprocess(
      (v) => {
        if (typeof v !== "string") return undefined
        const t = v.trim()
        return t.length === 0 ? undefined : t
      },
      z.union([z.string(), z.undefined()])
    )
  ),

  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.string().default("info"),

  PUBLIC_WEB_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("twotter"),

  EMAIL_FROM: z.string().default("twotter <noreply@localhost>"),
  RESEND_API_KEY: z.string().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITLAB_CLIENT_ID: z.string().optional(),
  GITLAB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // "Connect GitHub" OAuth App — separate from the login provider above so that linking your
  // GitHub for profile display can never overwrite the token better-auth uses to log you in.
  GITHUB_CONNECT_CLIENT_ID: z.string().optional(),
  GITHUB_CONNECT_CLIENT_SECRET: z.string().optional(),

  // Shared GitHub PAT (or App installation token) used to enrich post cards for GitHub URLs.
  // 5000 req/hr authenticated vs 60/hr unauthenticated — required to make the unfurl pipeline
  // actually work. If unset, posts containing GitHub URLs render fine but without the card.
  GITHUB_UNFURL_TOKEN: z.string().optional(),

  YOUTUBE_API_KEY: z.string().optional(),
  FXTWITTER_API_BASE_URL: z.string().optional(),

  // Symmetric key for at-rest encryption of connector OAuth tokens (oauth_connections table).
  // Must be 32 raw bytes encoded as base64 — anything shorter is rejected at boot. Rotation
  // story is versioned by the ciphertext prefix `v1:` (see lib/connector-crypto.ts).
  CONNECTORS_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (!v) return true
        try {
          return Buffer.from(v, "base64").length === 32
        } catch {
          return false
        }
      },
      { message: "CONNECTORS_ENCRYPTION_KEY must decode to 32 bytes (base64)" }
    ),

  REDIS_URL: z.string(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_PUBLIC_URL: z.string().url(),

  // How long signed S3 GET URLs minted by the /api/m/* proxy stay valid. Short TTL minimizes
  // damage if a signed URL leaks (e.g. is accidentally pasted into chat or a referer log).
  // Default 15min — long enough to survive a slow page load + image decode, short enough that
  // the URL is dead before most leak vectors find it.
  MEDIA_SIGNED_URL_TTL_SEC: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),

  // Add HSTS header in production. Off by default for dev (where requests come over http://localhost).
  // Enabling in prod opts the browser into HTTPS-only for this origin for 1 year, blocking
  // downgrade attacks. Only set this once you are sure HTTPS is permanent for the domain.
  ENABLE_HSTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Hard kill switch. When true, every request (except /healthz and /readyz) is short-circuited
  // with a 503 + `{ error: "maintenance" }` so the app can be locked down at runtime without a
  // redeploy when abuse is in progress. The client detects the 503 and renders a maintenance
  // screen over the whole UI.
  MAINTENANCE_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Human-readable banner shown on the maintenance screen. Kept on the server so it can be
  // updated without a client redeploy.
  MAINTENANCE_MESSAGE: z
    .string()
    .default("We're temporarily down for maintenance. Check back shortly."),

  // Databuddy server-side analytics API key (format: dbdy_xxx). Optional — if unset,
  // server-side event tracking is silently disabled.
  DATABUDDY_API_KEY: z.string().optional(),
  // Databuddy website/client ID — must match the VITE_PUBLIC_DATABUDDY_CLIENT_ID used
  // on the frontend so server-side events are scoped to the same website.
  DATABUDDY_WEBSITE_ID: z.string().optional(),

  // OpenAI API key for the /v1/moderations endpoint used to pre-publish-screen posts.
  // Optional — when unset, moderation is disabled and every post is accepted (with a
  // one-time warning at boot). Network errors / timeouts also fail open. Whitespace
  // is trimmed and empty strings are coerced to undefined so a misformatted env var
  // (e.g. `OPENAI_API_KEY= `) is treated as unset rather than a bogus key.
  OPENAI_API_KEY: z.optional(
    z.preprocess(
      (v) => {
        if (typeof v !== "string") return v
        const trimmed = v.trim()
        return trimmed.length === 0 ? undefined : trimmed
      },
      z.union([z.string(), z.undefined()])
    )
  ),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  const data = parsed.data
  if (data.NODE_ENV === "production" && !data.RESEND_API_KEY?.trim()) {
    console.error("Invalid environment:", { RESEND_API_KEY: ["Required"] })
    process.exit(1)
  }
  return {
    ...data,
    AUTH_TRUSTED_ORIGINS: expandLocalDevOrigins(
      data.AUTH_TRUSTED_ORIGINS,
      data.NODE_ENV
    ),
  }
}
