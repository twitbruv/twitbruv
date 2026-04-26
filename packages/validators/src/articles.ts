import { z } from 'zod'
import { uuidSchema } from './common.ts'

export const articleStatusSchema = z.enum(['draft', 'published', 'unlisted'])
export const articleFormatSchema = z.enum(['prosemirror', 'markdown', 'lexical'])

export const createArticleSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subtitle: z.string().max(200).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, dashes')
    .optional(),
  coverMediaId: uuidSchema.nullable().optional(),
  bodyFormat: articleFormatSchema.default('lexical'),
  bodyJson: z.unknown().optional(),
  bodyText: z.string().default(''),
  status: articleStatusSchema.default('draft'),
})

export const updateArticleSchema = createArticleSchema.partial()

export type CreateArticleInput = z.infer<typeof createArticleSchema>
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>
