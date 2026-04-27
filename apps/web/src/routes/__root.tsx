import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { Databuddy } from "@databuddy/sdk/react"
import { DatabuddyDevtools } from "@databuddy/devtools/react"
import { Toaster } from "sonner"
import appCss from "@workspace/ui/globals.css?url"
import { Button } from "@workspace/ui/components/button"
import { AppShell } from "../components/app-shell"
import { EmailVerifiedGate } from "../components/email-verified-gate"
import { MaintenanceScreen } from "../components/maintenance-screen"
import { NotFoundPanel } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { ThemeProvider, themeBootstrapScript, useTheme } from "../lib/theme"
import { APP_NAME, DATABUDDY_CLIENT_ID } from "../lib/env"
import { useMaintenance } from "../lib/maintenance"
import { MeProvider } from "../lib/me"
import { queryClient } from "../lib/query-client"
import type { RouterAppContext } from "../lib/router-context"
import { buildSeoMeta } from "../lib/seo"
import { getServerAuthState } from "../lib/auth-fns"

const DESCRIPTION = `${APP_NAME} — open-source, free-for-everyone social platform. No AI ranking, no paywalls, no ads.`

export const Route = createRootRouteWithContext<RouterAppContext>()({
  loader: () => getServerAuthState(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "theme-color",
        content: "#faf9f5",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#3a3a3a",
        media: "(prefers-color-scheme: dark)",
      },
      ...buildSeoMeta({
        title: APP_NAME,
        rawTitle: true,
        description: DESCRIPTION,
        path: "/",
      }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "alternate icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.json" },
    ],
    scripts: [{ children: themeBootstrapScript }],
  }),
  notFoundComponent: () => (
    <AppShell>
      <PageFrame>
        <NotFoundPanel
          title="Page not found"
          message="That URL does not exist or was removed."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button nativeButton={false} render={<Link to="/" />}>
              Home
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/search" />}
            >
              Search
            </Button>
          </div>
        </NotFoundPanel>
      </PageFrame>
    </AppShell>
  ),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  const { user: initialMe } = Route.useLoaderData()

  return (
    <ThemeProvider>
      <MaintenanceGate>
        <QueryClientProvider client={queryClient}>
          <MeProvider initialMe={initialMe}>
            <EmailVerifiedGate>
              <AppShell>
                <Outlet />
              </AppShell>
            </EmailVerifiedGate>
            <ThemedToaster />
            {DATABUDDY_CLIENT_ID ? (
              <Databuddy
                clientId={DATABUDDY_CLIENT_ID}
                trackWebVitals
                trackErrors
                trackPerformance
                trackOutgoingLinks
                trackInteractions
                enableBatching
                batchSize={20}
                maskPatterns={["/inbox/*", "/admin/*"]}
              />
            ) : null}
            <DatabuddyDevtools enabled={import.meta.env.DEV} />
          </MeProvider>
          {import.meta.env.DEV ? (
            <ReactQueryDevtools buttonPosition="bottom-left" />
          ) : null}
        </QueryClientProvider>
      </MaintenanceGate>
    </ThemeProvider>
  )
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster theme={resolvedTheme} richColors closeButton />
}

// Whole-app lockout. When build-time VITE_PUBLIC_MAINTENANCE_MODE is set, or the api wrapper
// has seen a 503 maintenance response, swap the entire app for the maintenance screen. Sits
// inside ThemeProvider so the screen still respects the user's theme but outside the query
// + me providers so we don't keep retrying API calls behind the lockout.
function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { active, message } = useMaintenance()
  if (active) return <MaintenanceScreen message={message} />
  return <>{children}</>
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
