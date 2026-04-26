import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'

export interface CreateClientOptions {
  /** Forwarded to better-fetch as a response observer. Lets the consumer hook into every
   *  auth response (e.g. to detect a server-side maintenance 503). */
  onResponse?: (res: Response) => void | Promise<void>
}

export function createClient(baseURL: string, options: CreateClientOptions = {}) {
  const onResponse = options.onResponse
  return createAuthClient({
    baseURL,
    plugins: [magicLinkClient()],
    fetchOptions: {
      credentials: 'include',
      onResponse: onResponse
        ? async (ctx) => {
            await onResponse(ctx.response)
          }
        : undefined,
    },
  })
}

export type AuthClient = ReturnType<typeof createClient>
