import { createFileRoute } from "@tanstack/react-router"
// Side-effect import: loads the server-route type augmentation
// (`server?` on FilebaseRouteOptionsInterface) so TS knows about the
// `server.handlers` shape on createFileRoute().
import "@tanstack/react-start"
import { ImageResponse } from "@vercel/og"
import { api } from "../lib/api"
import {
  OG_HEADERS,
  OG_SIZE,
  OgAvatar,
  OgFrame,
  getOgFonts,
  loadOgImage,
  truncate,
} from "../lib/og-image"
import type { ArticleDto } from "../lib/api"

function ArticleCard({
  article,
  handle,
  avatarSrc,
}: {
  article: ArticleDto
  handle: string
  avatarSrc: string | null
}) {
  const author = article.author
  const display = author.displayName || `@${author.handle ?? handle}`
  const initial = (author.displayName ?? author.handle ?? handle).slice(0, 1)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 78,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: -2,
          color: "white",
        }}
      >
        {truncate(article.title, 110)}
      </div>

      {article.subtitle && (
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.35,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {truncate(article.subtitle, 160)}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginTop: "auto",
        }}
      >
        <OgAvatar src={avatarSrc} initial={initial} size={56} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          <span style={{ fontWeight: 700, color: "white" }}>{display}</span>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
          <span>{article.readingMinutes} min read</span>
        </div>
      </div>
    </div>
  )
}

function NotFoundCard() {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        fontSize: 56,
        fontWeight: 600,
        color: "rgba(255,255,255,0.85)",
        letterSpacing: -0.5,
      }}
    >
      This article is no longer available.
    </div>
  )
}

export const Route = createFileRoute("/og/article/$handle/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const fonts = await getOgFonts()
        let article: ArticleDto | null = null
        try {
          article = (
            await api.userArticleBySlug(params.handle, params.slug)
          ).article
        } catch {
          // Fall through to placeholder card.
        }
        const avatarSrc = await loadOgImage(article?.author.avatarUrl)
        return new ImageResponse(
          (
            <OgFrame
              eyebrow={`Article · @${params.handle}`}
              seed={`${params.handle}/${params.slug}`}
            >
              {article ? (
                <ArticleCard
                  article={article}
                  handle={params.handle}
                  avatarSrc={avatarSrc}
                />
              ) : (
                <NotFoundCard />
              )}
            </OgFrame>
          ),
          {
            ...OG_SIZE,
            fonts,
            headers: OG_HEADERS,
            status: article ? 200 : 404,
          }
        )
      },
    },
  },
})
