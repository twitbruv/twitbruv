import { z } from 'zod'
import { uuidSchema } from './common.ts'

export const POLL_OPTION_MAX_LEN = 80
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 4
// 5 minutes to 7 days, matching Twitter's range.
export const POLL_MIN_DURATION_MIN = 5
export const POLL_MAX_DURATION_MIN = 60 * 24 * 7

export const pollInputSchema = z.object({
  options: z
    .array(z.string().trim().min(1).max(POLL_OPTION_MAX_LEN))
    .min(POLL_MIN_OPTIONS)
    .max(POLL_MAX_OPTIONS),
  durationMinutes: z
    .number()
    .int()
    .min(POLL_MIN_DURATION_MIN)
    .max(POLL_MAX_DURATION_MIN),
  allowMultiple: z.boolean().default(false),
})

export const pollVoteSchema = z.object({
  optionIds: z.array(uuidSchema).min(1).max(POLL_MAX_OPTIONS),
})

export type PollInput = z.infer<typeof pollInputSchema>
export type PollVoteInput = z.infer<typeof pollVoteSchema>
