import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export function createClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [magicLinkClient(), passkeyClient()],
    fetchOptions: {
      credentials: 'include',
    },
  })
}

export type AuthClient = ReturnType<typeof createClient>
