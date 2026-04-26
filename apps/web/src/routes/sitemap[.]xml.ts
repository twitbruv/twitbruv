import { createFileRoute } from "@tanstack/react-router"
// Side-effect import: loads the server-route type augmentation so TS knows
// about the `server.handlers` shape on createFileRoute().
import "@tanstack/react-start"
import { WEB_URL } from "../lib/env"

const STATIC_URLS: Array<{
  path: string
  changefreq: string
  priority: number
}> = [
  { path: "/", changefreq: "daily", priority: 1.0 },
  { path: "/login", changefreq: "monthly", priority: 0.4 },
  { path: "/signup", changefreq: "monthly", priority: 0.6 },
  { path: "/search", changefreq: "weekly", priority: 0.5 },
]

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${STATIC_URLS.map(
  (u) =>
    `  <url><loc>${WEB_URL}${u.path}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`
).join("\n")}
</urlset>
`
        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control":
              "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
        })
      },
    },
  },
})
