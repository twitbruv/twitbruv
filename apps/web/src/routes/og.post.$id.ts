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
      const { post } = await api.post(params.id)
      const author = post.author.displayName || `@${post.author.handle ?? "user"}`
      const stats: Array<string> = []
      if (post.counts.likes > 0) stats.push(`${compactNumber(post.counts.likes)} likes`)
      if (post.counts.reposts > 0) stats.push(`${compactNumber(post.counts.reposts)} reposts`)
      if (post.counts.replies > 0) stats.push(`${compactNumber(post.counts.replies)} replies`)
      const svg = renderOgSvg({
        eyebrow: post.author.handle ? `@${post.author.handle} · post` : "post",
        title: post.text || `(post by ${author})`,
        subtitle: author,
        footer: stats.join(" · "),
      })
      return new Response(svg, { headers: OG_HEADERS })
    } catch {
      const svg = renderOgSvg({
        eyebrow: "post",
        title: "This post is no longer available.",
      })
      return new Response(svg, { headers: OG_HEADERS, status: 404 })
    }
  },
})
