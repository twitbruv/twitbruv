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
import type { PublicProfile } from "../lib/api"

const BADGE_GRADIENT: Record<string, string> = {
  user: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
  contributor: "linear-gradient(135deg, #d946ef 0%, #a855f7 100%)",
  admin: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  owner: "linear-gradient(135deg, #fde047 0%, #f59e0b 100%)",
}

function ProfileCard({
  user,
  avatarSrc,
}: {
  user: PublicProfile
  avatarSrc: string | null
}) {
  const display = user.displayName || `@${user.handle}`
  const initial = (user.displayName ?? user.handle ?? "·").slice(0, 1)

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        gap: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
        }}
      >
        <OgAvatar src={avatarSrc} initial={initial} size={140} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: -1.5,
              lineHeight: 1.05,
            }}
          >
            {truncate(display, 30)}
            {(() => {
              const tier = resolveBadgeTier(user)
              if (!tier) return null
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: BADGE_GRADIENT[tier],
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#0a0a0a",
                  }}
                >
                  ✓
                </div>
              )
            })()}
          </div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.6)" }}>
            @{user.handle}
          </div>
        </div>
      </div>

      {user.bio && (
        <div
          style={{
            display: "flex",
            fontSize: 28,
            lineHeight: 1.4,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          {truncate(user.bio, 220)}
        </div>
      )}

      <div style={{ marginTop: "auto" }}>
        <OgStats
          items={[
            { label: "followers", value: user.counts.followers },
            { label: "following", value: user.counts.following },
            { label: "posts", value: user.counts.posts },
          ]}
        />
      </div>
    </div>
  )
}

function NotFoundCard({ handle }: { handle: string }) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        fontSize: 64,
        fontWeight: 700,
        color: "rgba(255,255,255,0.85)",
        letterSpacing: -1,
      }}
    >
      @{handle} doesn't exist here.
    </div>
  )
}

export const Route = createFileRoute("/og/user/$handle")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const fonts = await getOgFonts()
        let user: PublicProfile | null = null
        try {
          user = (await api.user(params.handle)).user
        } catch {
          // Fall through to placeholder card.
        }
        const avatarSrc = await loadOgImage(user?.avatarUrl)
        return new ImageResponse(
          <OgFrame
            eyebrow={user ? `Profile · @${user.handle}` : "Profile"}
            seed={params.handle}
          >
            {user ? (
              <ProfileCard user={user} avatarSrc={avatarSrc} />
            ) : (
              <NotFoundCard handle={params.handle} />
            )}
          </OgFrame>,
          {
            ...OG_SIZE,
            fonts,
            headers: OG_HEADERS,
            status: user ? 200 : 404,
          }
        )
      },
    },
  },
})
