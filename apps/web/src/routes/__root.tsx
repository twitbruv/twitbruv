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
import { APP_NAME, WEB_URL } from "../lib/env"
import { MeProvider } from "../lib/me"
import { QueryProvider } from "../lib/query"

const DESCRIPTION = `${APP_NAME} — open-source, free-for-everyone social platform. No AI ranking, no paywalls, no ads.`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#1d4ed8" },
      { title: APP_NAME },
      { name: "description", content: DESCRIPTION },
      // Open Graph: shows up in Slack/Discord/Twitter unfurls.
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: `${WEB_URL}/og.svg` },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: APP_NAME },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${WEB_URL}/og.svg` },
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
