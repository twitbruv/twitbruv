import { createServerFileRoute } from "@tanstack/react-start/server"
import { api } from "../lib/api"
import { OG_HEADERS, renderOgSvg } from "../lib/og-image"

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params }) => {
    try {
      const { article } = await api.userArticleBySlug(params.handle, params.slug)
      const author =
        article.author.displayName || `@${article.author.handle ?? params.handle}`
      const svg = renderOgSvg({
        eyebrow: `Article · @${params.handle}`,
        title: article.title,
        subtitle: article.subtitle ?? author,
        footer: `${article.readingMinutes} min read`,
      })
      return new Response(svg, { headers: OG_HEADERS })
    } catch {
      const svg = renderOgSvg({
        eyebrow: "Article",
        title: "This article is no longer available.",
      })
      return new Response(svg, { headers: OG_HEADERS, status: 404 })
    }
  },
})
