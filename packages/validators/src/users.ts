import { z } from "zod"

// Handles are 3-20 chars, alphanumeric + underscore, citext-matched on insert.
// Reserved paths and profanity banlist are enforced at the api layer.
export const handleSchema = z
  .string()
  .min(3, "Handle must be at least 3 characters.")
  .max(20)
  .regex(/^[a-z0-9_]+$/i, "letters, numbers, and underscore only")

export const displayNameSchema = z.string().trim().min(1).max(50)
export const bioSchema = z.string().max(280)
export const locationSchema = z.string().max(50)
export const websiteSchema = z.string().url().max(200)

// Profile text fields accept an empty string in update payloads to mean
// "clear this field". The API converts empty strings to NULL before writing.
export const updateProfileSchema = z.object({
  displayName: displayNameSchema.optional().or(z.literal("")),
  bio: bioSchema.optional(),
  location: locationSchema.optional(),
  websiteUrl: websiteSchema.optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  birthday: z.string().date().optional().or(z.literal("")),
  timezone: z.string().max(60).optional(),
  locale: z.string().max(10).optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const claimHandleSchema = z.object({ handle: handleSchema })

export const EXPERIMENT_DEFAULTS = {
  forYouFeed: true,
} as const satisfies Record<string, boolean>

export type ExperimentPrefs = { [K in keyof typeof EXPERIMENT_DEFAULTS]?: boolean }

export const updateExperimentsSchema = z.object({
  forYouFeed: z.boolean().optional(),
})

export type UpdateExperimentsInput = z.infer<typeof updateExperimentsSchema>

export function resolveExperiments(
  stored: ExperimentPrefs | null | undefined,
): { [K in keyof typeof EXPERIMENT_DEFAULTS]: boolean } {
  return {
    ...EXPERIMENT_DEFAULTS,
    ...stored,
  }
}

export const adminSetUserHandleSchema = z.object({
  handle: handleSchema,
  reason: z.string().trim().min(1).max(500).optional(),
})
