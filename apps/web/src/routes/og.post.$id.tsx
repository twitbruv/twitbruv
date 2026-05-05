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
  OgStats,
  getOgFonts,
  loadOgImage,
  truncate,
} from "../lib/og-image"
import { resolveBadgeTier } from "../components/verified-badge"
import type { Post } from "../lib/api"

const BADGE_GRADIENT: Record<string, string> = {
  user: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
  contributor: "linear-gradient(135deg, #d946ef 0%, #a855f7 100%)",
  admin: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  owner: "linear-gradient(135deg, #fde047 0%, #f59e0b 100%)",
}

function PostCard({
  post,
  avatarSrc,
}: {
  post: Post
  avatarSrc: string | null
}) {
  const handle = post.author.handle ?? "user"
  const display = post.author.displayName || `@${handle}`
  const initial = (post.author.displayName ?? handle).slice(0, 1)

  // Headline gets the largest face-value text; longer posts compress slightly so we
  // can still fit ~280 chars without overflow. Anything beyond that is truncated.
  const text = post.text || ""
  const fontSize = text.length < 100 ? 60 : text.length < 200 ? 50 : 42

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize,
          fontWeight: 600,
          lineHeight: 1.25,
          letterSpacing: -0.5,
          color: "white",
        }}
      >
        {truncate(text, 320) || `Post by ${display}`}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginTop: "auto",
        }}
      >
        <OgAvatar src={avatarSrc} initial={initial} size={64} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {display}
            {(() => {
              const tier = resolveBadgeTier(post.author)
              if (!tier) return null
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    background: BADGE_GRADIENT[tier],
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0a0a0a",
                  }}
                >
                  ✓
                </div>
              )
            })()}
          </div>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.6)" }}>
            @{handle}
          </div>
        </div>
      </div>

      <OgStats
        items={[
          { label: "likes", value: post.counts.likes },
          { label: "reposts", value: post.counts.reposts },
          { label: "replies", value: post.counts.replies },
          { label: "saves", value: post.counts.bookmarks },
        ]}
      />
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
      This post is no longer available.
    </div>
  )
}

export const Route = createFileRoute("/og/post/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const fonts = await getOgFonts()
        let post: Post | null = null
        try {
          post = (await api.post(params.id)).post
        } catch {
          // Falls through to NotFoundCard rather than 500ing the unfurler.
        }
        // Resolve the avatar in parallel with anything else that might land here
        // later. Satori can't decode webp, so we transcode server-side.
        const avatarSrc = await loadOgImage(post?.author.avatarUrl)
        return new ImageResponse(
          <OgFrame
            eyebrow={
              post?.author.handle ? `Post · @${post.author.handle}` : "Post"
            }
            seed={post?.id ?? params.id}
          >
            {post ? (
              <PostCard post={post} avatarSrc={avatarSrc} />
            ) : (
              <NotFoundCard />
            )}
          </OgFrame>,
          {
            ...OG_SIZE,
            fonts,
            headers: OG_HEADERS,
            status: post ? 200 : 404,
          }
        )
      },
    },
  },
})
