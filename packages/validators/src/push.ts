import { z } from "zod"

export const pushRegisterBodySchema = z.object({
  token: z.string().min(32).max(512),
  environment: z.enum(["sandbox", "production"]),
  bundleId: z.string().min(1).max(200),
  appVersion: z.string().max(64).optional(),
  osVersion: z.string().max(64).optional(),
})

export const pushUnregisterBodySchema = z.object({
  token: z.string().min(32).max(512),
})
