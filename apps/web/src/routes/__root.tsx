import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"
import { IconContext } from "@phosphor-icons/react"
import { Databuddy } from "@databuddy/sdk/react"

import appCss from "@workspace/ui/globals.css?url"
import { Button } from "@workspace/ui/components/button"
import { AppShell } from "../components/app-shell"
import { NotFoundPanel } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { ThemeProvider, themeBootstrapScript } from "../lib/theme"
import { APP_NAME, DATABUDDY_CLIENT_ID } from "../lib/env"
import { MeProvider } from "../lib/me"
import { QueryProvider } from "../lib/query"
import { buildSeoMeta } from "../lib/seo"

const DESCRIPTION = `${APP_NAME} — open-source, free-for-everyone social platform. No AI ranking, no paywalls, no ads.`

export const Route = createRootRoute({
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
  component: () => (
    <IconContext.Provider value={{ weight: "duotone" }}>
      <QueryProvider>
        <ThemeProvider>
          <MeProvider>
            <AppShell>
              <Outlet />
            </AppShell>
            {DATABUDDY_CLIENT_ID ? (
              <Databuddy
                clientId={DATABUDDY_CLIENT_ID}
                trackWebVitals
                trackErrors
              />
            ) : null}
          </MeProvider>
        </ThemeProvider>
      </QueryProvider>
    </IconContext.Provider>
  ),
})

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
