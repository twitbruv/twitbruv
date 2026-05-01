import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  EMAIL_FROM: z.string().default("twotter <noreply@localhost>"),
  RESEND_API_KEY: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string(),
  S3_PUBLIC_URL: z.string().url(),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  GITHUB_UNFURL_TOKEN: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  FXTWITTER_API_BASE_URL: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    !parsed.data.RESEND_API_KEY?.trim()
  ) {
    console.error("Invalid environment:", { RESEND_API_KEY: ["Required"] })
    process.exit(1)
  }
  return parsed.data
}
