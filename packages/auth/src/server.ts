import { passkey } from "@better-auth/passkey"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink } from "better-auth/plugins/magic-link"
import { twoFactor } from "better-auth/plugins/two-factor"
import { admin as adminPlugin } from "better-auth/plugins/admin"
import type { Database } from "@workspace/db"
import { COOKIE_PREFIX } from "./constants.ts"

function resolvePasskeyRpId(authBaseURL: string, explicit?: string) {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed
  try {
    return new URL(authBaseURL).hostname
  } catch {
    return "localhost"
  }
}

export interface AuthConfig {
  db: Database
  baseURL: string
  secret: string
  trustedOrigins: Array<string>
  cookieDomain?: string
  appName: string
  passkeyRpId?: string
  sendEmail: (args: {
    to: string
    subject: string
    template: "verify" | "reset" | "magic-link" | "welcome"
    data: Record<string, unknown>
  }) => Promise<void>
  github?: { clientId: string; clientSecret: string }
  gitlab?: { clientId: string; clientSecret: string }
  google?: { clientId: string; clientSecret: string }
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    crossSubDomainCookies: config.cookieDomain ? { enabled: true, domain: config.cookieDomain } : undefined,
    database: drizzleAdapter(config.db, {
      provider: "pg",
      // Our schema uses plural table names (users, sessions, accounts, verifications, …)
      // whereas better-auth defaults to singular.
      usePlural: true,
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // 1 day
      // Cookie cache TTL (seconds). Too short forces constant DB revalidation and made
      // sessions feel broken (~30s). Better-auth defaults to 5 minutes; that still bounds
      // worst-case lag for forced logout (revoke/ban) vs trusting stale session_data.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      // Our auth tables use uuid PKs with defaultRandom() in Postgres.
      // Disable better-auth's own id generation so inserts rely on the DB default.
      database: {
        generateId: false,
      },
      cookiePrefix: COOKIE_PREFIX,
      cookies: {
        session_token: {
          attributes: {
            sameSite: "lax",
            secure: config.baseURL.startsWith("https"),
            httpOnly: true,
            ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
          },
        },
      },
      crossSubDomainCookies: config.cookieDomain
        ? { enabled: true, domain: config.cookieDomain }
        : undefined,
    },
    emailAndPassword: {
      enabled: true,
      // Verification emails still fire; posting will gate on emailVerified in M2.
      requireEmailVerification: false,
      minPasswordLength: 10,
      autoSignIn: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await config.sendEmail({
          to: user.email,
          subject: `Reset your ${config.appName} password`,
          template: "reset",
          data: { url, name: user.name ?? "" },
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await config.sendEmail({
          to: user.email,
          subject: `Verify your ${config.appName} email`,
          template: "verify",
          data: { url, name: user.name ?? "" },
        })
      },
    },
    socialProviders: {
      ...(config.github
        ? {
            github: {
              clientId: config.github.clientId,
              clientSecret: config.github.clientSecret,
              scope: ["read:user", "user:email"],
            },
          }
        : {}),
      ...(config.gitlab
        ? {
            gitlab: {
              clientId: config.gitlab.clientId,
              clientSecret: config.gitlab.clientSecret,
              scope: ["read_user"],
            },
          }
        : {}),
      ...(config.google
        ? {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
              scope: ["openid", "email", "profile"],
            },
          }
        : {}),
    },
    plugins: [
      passkey({
        rpName: config.appName,
        rpID: resolvePasskeyRpId(config.baseURL, config.passkeyRpId),
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.sendEmail({
            to: email,
            subject: `Sign in to ${config.appName}`,
            template: "magic-link",
            data: { url },
          })
        },
      }),
      twoFactor(),
      adminPlugin(),
    ],
  })
}

export type AuthInstance = ReturnType<typeof createAuth>
