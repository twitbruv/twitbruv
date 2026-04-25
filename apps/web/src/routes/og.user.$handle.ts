import { createServerFileRoute } from "@tanstack/react-start/server"
import { api } from "../lib/api"
import { OG_HEADERS, renderOgSvg } from "../lib/og-image"

const compactNumber = (n: number) => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params }) => {
    try {
      const { user } = await api.user(params.handle)
      const name = user.displayName || `@${user.handle}`
      const stats: Array<string> = []
      if (user.counts.followers > 0) {
        stats.push(`${compactNumber(user.counts.followers)} followers`)
      }
      if (user.counts.posts > 0) {
        stats.push(`${compactNumber(user.counts.posts)} posts`)
      }
      const svg = renderOgSvg({
        eyebrow: `@${user.handle ?? params.handle}`,
        title: name,
        subtitle: user.bio ?? undefined,
        footer: stats.join(" · "),
      })
      return new Response(svg, { headers: OG_HEADERS })
    } catch {
      const svg = renderOgSvg({
        eyebrow: "Profile",
        title: `@${params.handle} not found`,
      })
      return new Response(svg, { headers: OG_HEADERS, status: 404 })
    }
  },
})
