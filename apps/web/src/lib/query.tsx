import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
