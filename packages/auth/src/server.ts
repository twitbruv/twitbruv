import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins/magic-link'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { admin as adminPlugin } from 'better-auth/plugins/admin'
import { passkey } from '@better-auth/passkey'
import type { Database } from '@workspace/db'

export interface AuthConfig {
  db: Database
  baseURL: string
  secret: string
  trustedOrigins: Array<string>
  cookieDomain?: string
  appName: string
  sendEmail: (args: {
    to: string
    subject: string
    template: 'verify' | 'reset' | 'magic-link' | 'welcome'
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
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      // Our schema uses plural table names (users, sessions, accounts, verifications, …)
      // whereas better-auth defaults to singular.
      usePlural: true,
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    advanced: {
      // Our auth tables use uuid PKs with defaultRandom() in Postgres.
      // Disable better-auth's own id generation so inserts rely on the DB default.
      database: {
        generateId: false,
      },
      cookiePrefix: 'twotter',
      cookies: {
        session_token: {
          attributes: {
            sameSite: 'lax',
            secure: config.baseURL.startsWith('https'),
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
      sendResetPassword: async ({ user, url }) => {
        await config.sendEmail({
          to: user.email,
          subject: `Reset your ${config.appName} password`,
          template: 'reset',
          data: { url, name: user.name ?? '' },
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
          template: 'verify',
          data: { url, name: user.name ?? '' },
        })
      },
    },
    socialProviders: {
      ...(config.github
        ? {
            github: {
              clientId: config.github.clientId,
              clientSecret: config.github.clientSecret,
              scope: ['read:user', 'user:email'],
            },
          }
        : {}),
      ...(config.gitlab
        ? {
            gitlab: {
              clientId: config.gitlab.clientId,
              clientSecret: config.gitlab.clientSecret,
              scope: ['read_user'],
            },
          }
        : {}),
      ...(config.google
        ? {
            google: {
              clientId: config.google.clientId,
              clientSecret: config.google.clientSecret,
              scope: ['openid', 'email', 'profile'],
            },
          }
        : {}),
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.sendEmail({
            to: email,
            subject: `Sign in to ${config.appName}`,
            template: 'magic-link',
            data: { url },
          })
        },
      }),
      twoFactor(),
      adminPlugin(),
      // Passkeys (WebAuthn). The plugin maps onto the existing `passkeys`
      // table that's already in the schema. The rpName/rpID pair drives the
      // browser's UI ("Use a passkey for <rpName>?").
      passkey({
        rpName: config.appName,
        rpID: rpIDFromUrl(config.baseURL),
        origin: config.baseURL,
      }),
    ],
  })
}

export type AuthInstance = ReturnType<typeof createAuth>

// rpID for WebAuthn must be the eTLD+1 (or a registrable subdomain) of the
// origin the user is currently on. We derive it from baseURL so dev (localhost)
// and prod don't need separate env vars.
function rpIDFromUrl(baseURL: string): string {
  try {
    return new URL(baseURL).hostname
  } catch {
    return 'localhost'
  }
}
