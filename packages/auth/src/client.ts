import { passkeyClient } from "@better-auth/passkey/client"
import { magicLinkClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export interface CreateClientOptions {
  onResponse?: (res: Response) => void | Promise<void>
}

export function createClient(baseURL: string, options: CreateClientOptions = {}) {
  const onResponse = options.onResponse
  return createAuthClient({
    baseURL,
    plugins: [magicLinkClient(), passkeyClient()],
    fetchOptions: {
      credentials: "include",
      onResponse: onResponse
        ? async (ctx) => {
            await onResponse(ctx.response)
          }
        : undefined,
    },
  })
}

export type AuthClient = ReturnType<typeof createClient>
