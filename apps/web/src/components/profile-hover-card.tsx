import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Avatar } from "@workspace/ui/components/avatar"
import { PreviewCard } from "@workspace/ui/components/preview-card"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { VerifiedBadge, resolveBadgeTier } from "./verified-badge"
import type { ReactNode } from "react"

interface ProfileHoverCardProps {
  handle: string
  children: ReactNode
}

export function ProfileHoverCard({ handle, children }: ProfileHoverCardProps) {
  return (
    <PreviewCard.Root>
      {/* span (not div) keeps the trigger valid inside <p> bodies. */}
      <PreviewCard.Trigger render={<span />}>{children}</PreviewCard.Trigger>
      <PreviewCard.Content side="bottom" align="start" sideOffset={8}>
        <ProfileCardInner handle={handle} />
      </PreviewCard.Content>
    </PreviewCard.Root>
  )
}

function ProfileCardInner({ handle }: { handle: string }) {
  // The qk.user(handle) cache is shared with /$handle/index.tsx, which
  // stores the unwrapped user object (not { user }) — match that shape.
  const { data: profile, isPending } = useQuery({
    queryKey: qk.user(handle),
    queryFn: async () => (await api.user(handle)).user,
    staleTime: 60_000,
  })

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="border-t-primary size-5 animate-spin rounded-full border-2 border-neutral" />
      </div>
    )
  }

  if (!profile) return null

  const initial = (profile.displayName ?? profile.handle ?? "?")
    .slice(0, 1)
    .toUpperCase()
  const badgeTier = resolveBadgeTier(profile)

  return (
    <div className="flex flex-col gap-3 p-4">
      <Link to="/$handle" params={{ handle }}>
        <Avatar
          initial={initial}
          src={profile.avatarUrl}
          size="xl"
          className="ring-1 ring-neutral"
        />
      </Link>

      <div className="min-w-0">
        <Link
          to="/$handle"
          params={{ handle }}
          className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          {profile.displayName || `@${handle}`}
          {badgeTier && <VerifiedBadge size={14} role={badgeTier} />}
        </Link>
        <span className="text-xs text-tertiary">@{handle}</span>
      </div>

      {profile.bio && (
        <p className="line-clamp-3 text-sm leading-relaxed text-primary">
          {profile.bio}
        </p>
      )}

      <div className="flex gap-3 text-xs">
        <Link
          to="/$handle/following"
          params={{ handle }}
          className="hover:underline"
        >
          <span className="font-semibold text-primary">
            {formatCount(profile.counts.following)}
          </span>{" "}
          <span className="text-tertiary">Following</span>
        </Link>
        <Link
          to="/$handle/followers"
          params={{ handle }}
          className="hover:underline"
        >
          <span className="font-semibold text-primary">
            {formatCount(profile.counts.followers)}
          </span>{" "}
          <span className="text-tertiary">Followers</span>
        </Link>
      </div>
    </div>
  )
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000)
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}
