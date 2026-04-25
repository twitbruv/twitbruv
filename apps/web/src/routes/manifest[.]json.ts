import { createFileRoute } from "@tanstack/react-router"
// Side-effect import: loads the server-route type augmentation so TS knows
// about the `server.handlers` shape on createFileRoute().
import "@tanstack/react-start"
import { APP_NAME } from "../lib/env"

const DESCRIPTION = `${APP_NAME} — open-source, free-for-everyone social platform. No AI ranking, no paywalls, no ads.`

export const Route = createFileRoute("/manifest.json")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            name: APP_NAME,
            short_name: APP_NAME,
            description: DESCRIPTION,
            icons: [
              {
                src: "/favicon.ico",
                sizes: "64x64 32x32 24x24 16x16",
                type: "image/x-icon",
              },
              {
                src: "/favicon.svg",
                type: "image/svg+xml",
                sizes: "any",
                purpose: "any",
              },
            ],
            start_url: "/",
            scope: "/",
            display: "standalone",
            orientation: "portrait",
            theme_color: "#1d4ed8",
            background_color: "#0a0a0a",
          },
          {
            headers: {
              "Content-Type": "application/manifest+json; charset=utf-8",
              "Cache-Control":
                "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
            },
          }
        ),
    },
  },
})
