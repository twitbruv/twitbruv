import { z } from 'zod'

export const LIST_TITLE_MAX = 60
export const LIST_DESCRIPTION_MAX = 280
export const LIST_SLUG_RE = /^[a-z0-9-]{1,40}$/

export const createListSchema = z.object({
  slug: z.string().regex(LIST_SLUG_RE, 'invalid slug'),
  title: z.string().trim().min(1).max(LIST_TITLE_MAX),
  description: z.string().trim().max(LIST_DESCRIPTION_MAX).optional(),
  isPrivate: z.boolean().default(false),
})

export const updateListSchema = z.object({
  title: z.string().trim().min(1).max(LIST_TITLE_MAX).optional(),
  description: z.string().trim().max(LIST_DESCRIPTION_MAX).nullable().optional(),
  isPrivate: z.boolean().optional(),
})

export type CreateListInput = z.infer<typeof createListSchema>
export type UpdateListInput = z.infer<typeof updateListSchema>
