import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router"

import appCss from "@workspace/ui/globals.css?url"
import { AppShell } from "../components/app-shell"
import { PageFrame } from "../components/page-frame"
import { ThemeProvider, themeBootstrapScript } from "../lib/theme"
import { APP_NAME } from "../lib/env"
import { MeProvider } from "../lib/me"
import { QueryProvider } from "../lib/query"
import { buildSeoMeta } from "../lib/seo"

const DESCRIPTION = `${APP_NAME} — open-source, free-for-everyone social platform. No AI ranking, no paywalls, no ads.`

export const Route = createRootRoute({
  head: () => ({
    // Per-page heads can override these; defaults are the landing-page card.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#1d4ed8" },
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
        <main className="p-4 pt-16">
          <h1 className="text-lg font-semibold">404</h1>
          <p className="text-sm text-muted-foreground">
            The requested page could not be found.
          </p>
        </main>
      </PageFrame>
    </AppShell>
  ),
  shellComponent: RootDocument,
  component: () => (
    <QueryProvider>
      <ThemeProvider>
        <MeProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </MeProvider>
      </ThemeProvider>
    </QueryProvider>
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
