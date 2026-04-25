import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
  AUTH_TRUSTED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  AUTH_COOKIE_DOMAIN: z.string().optional(),

  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.string().default("info"),

  PUBLIC_WEB_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("twotter"),

  EMAIL_FROM: z.string().default("twotter <noreply@localhost>"),
  EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITLAB_CLIENT_ID: z.string().optional(),
  GITLAB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  REDIS_URL: z.string().default("redis://localhost:6379"),

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
  MEDIA_SIGNED_URL_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(900),

  // Add HSTS header in production. Off by default for dev (where requests come over http://localhost).
  // Enabling in prod opts the browser into HTTPS-only for this origin for 1 year, blocking
  // downgrade attacks. Only set this once you are sure HTTPS is permanent for the domain.
  ENABLE_HSTS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  return parsed.data
}
