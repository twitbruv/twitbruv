import { z } from 'zod'
import { uuidSchema } from './common.ts'
import { postVisibilitySchema, replyRestrictionSchema, POST_MAX_LEN } from './posts.ts'

// Scheduled time must be at least a minute out and within 90 days. Tighter than necessary on
// the upper bound, but it bounds the worker's window and keeps the UI sane.
export const SCHEDULE_MIN_LEAD_SEC = 60
export const SCHEDULE_MAX_LEAD_DAYS = 90

export const createScheduledPostSchema = z.object({
  text: z.string().trim().max(POST_MAX_LEN),
  mediaIds: z.array(uuidSchema).max(4).optional(),
  visibility: postVisibilitySchema.default('public'),
  replyRestriction: replyRestrictionSchema.default('anyone'),
  sensitive: z.boolean().default(false),
  contentWarning: z.string().max(100).optional(),
  // Null/missing = save as draft. ISO timestamp = scheduled publish time.
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
})

export const updateScheduledPostSchema = createScheduledPostSchema.partial()

export type CreateScheduledPostInput = z.infer<typeof createScheduledPostSchema>
export type UpdateScheduledPostInput = z.infer<typeof updateScheduledPostSchema>
