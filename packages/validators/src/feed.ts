import { z } from "zod"

export const FEED_DEFAULT_LIMIT = 40
export const FEED_MAX_LIMIT = 100

const feedLimitSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return FEED_DEFAULT_LIMIT
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return FEED_DEFAULT_LIMIT
  }

  return Math.min(Math.floor(numeric), FEED_MAX_LIMIT)
}, z.number().int().min(1).max(FEED_MAX_LIMIT))

export const feedQuerySchema = z.object({
  limit: feedLimitSchema.optional().default(FEED_DEFAULT_LIMIT),
  cursor: z.string().optional(),
})

export const forYouFeedQuerySchema = z.object({
  limit: feedLimitSchema.optional().default(FEED_DEFAULT_LIMIT),
  cursor: z.preprocess(
    (value) => (typeof value === "string" ? value : null),
    z.string().nullable()
  ).optional().default(null),
})

export type FeedQuery = z.infer<typeof feedQuerySchema>
export type ForYouFeedQuery = z.infer<typeof forYouFeedQuerySchema>
