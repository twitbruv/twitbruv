import { z } from 'zod'
import { handleSchema } from './users.ts'

// Cooldown between verification-email resends. Mirrored on the server in the
// `auth.email-verify-resend` rate-limit bucket and on the client in the
// resend-button countdown — keep the two in lock-step by importing this constant.
export const RESEND_COOLDOWN_SEC = 90

export const emailSchema = z.string().email().max(254)
export const passwordSchema = z
  .string()
  .min(10, 'at least 10 characters')
  .max(256)

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  handle: handleSchema,
  displayName: z.string().trim().min(1).max(50).optional(),
})

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const magicLinkSchema = z.object({ email: emailSchema })

export const passwordResetRequestSchema = z.object({ email: emailSchema })
export const passwordResetSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
})

export type SignUpInput = z.infer<typeof signUpSchema>
export type SignInInput = z.infer<typeof signInSchema>
