import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.string().default("info"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
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
