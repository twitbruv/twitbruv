import { useCallback, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { PreviewCard } from "@workspace/ui/components/preview-card"
import {
  VerifiedBadge,
  resolveBadgeTier,
} from "@workspace/ui/components/verified-badge"
import { cn } from "@workspace/ui/lib/utils"
import { api } from "../lib/api"
import type { ReactNode } from "react"

interface HoverProfile {
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  isVerified?: boolean
  isContributor?: boolean
  role?: "user" | "admin" | "owner" | null
  followers: number
  following: number
  isFollowing?: boolean
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function ProfileContent({
  handle,
  profile,
}: {
  handle: string
  profile: HoverProfile
}) {
  const [isFollowing, setIsFollowing] = useState(profile.isFollowing)
  const [followerCount, setFollowerCount] = useState(profile.followers)
  const [busy, setBusy] = useState(false)

  const displayName = profile.displayName || handle
  const tier = resolveBadgeTier(profile)

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <Link
          to="/$handle"
          params={{ handle }}
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar initial={displayName[0]} src={profile.avatarUrl} size="xl" />
        </Link>
        {isFollowing !== undefined && (
          <Button
            size="sm"
            variant={isFollowing ? "outline" : "primary"}
            disabled={busy}
            onClick={async (e) => {
              e.stopPropagation()
              if (busy) return
              setBusy(true)
              const next = !isFollowing
              setIsFollowing(next)
              setFollowerCount((c) => c + (next ? 1 : -1))
              try {
                if (next) await api.follow(handle)
                else await api.unfollow(handle)
              } catch {
                setIsFollowing(!next)
                setFollowerCount((c) => c + (next ? -1 : 1))
              } finally {
                setBusy(false)
              }
            }}
          >
            {isFollowing ? "Following" : "Follow"}
          </Button>
        )}
      </div>
      <div className="min-w-0">
        <Link
          to="/$handle"
          params={{ handle }}
          className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
          {tier ? <VerifiedBadge size={15} role={tier} /> : null}
        </Link>
        <span className="text-xs text-tertiary">@{handle}</span>
      </div>
      {profile.bio && (
        <p className="line-clamp-3 text-sm leading-relaxed text-primary">
          {profile.bio}
        </p>
      )}
      <div className="flex gap-3 text-xs">
        <span>
          <span className="font-semibold text-primary">
            {compactCount(profile.following)}
          </span>{" "}
          <span className="text-tertiary">Following</span>
        </span>
        <span>
          <span className="font-semibold text-primary">
            {compactCount(followerCount)}
          </span>{" "}
          <span className="text-tertiary">Followers</span>
        </span>
      </div>
    </div>
  )
}

const profileCache = new Map<string, HoverProfile>()

export function fetchProfile(handle: string): Promise<HoverProfile> {
  const cached = profileCache.get(handle)
  if (cached) return Promise.resolve(cached)

  return api.user(handle).then(({ user }) => {
    const profile: HoverProfile = {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isVerified: user.isVerified,
      isContributor: user.isContributor,
      role: user.role,
      followers: user.counts.followers,
      following: user.counts.following,
      isFollowing: user.viewer?.following,
    }
    profileCache.set(handle, profile)
    return profile
  })
}

function useProfileFetch(handle: string) {
  const [profile, setProfile] = useState<HoverProfile | null>(
    () => profileCache.get(handle) ?? null
  )

  const onOpen = useCallback(
    (open: boolean) => {
      if (open && !profile) {
        fetchProfile(handle)
          .then(setProfile)
          .catch(() => {})
      }
    },
    [handle, profile]
  )

  return { profile, onOpen }
}

/**
 * An @mention that shows an author hover card on hover.
 */
export function MentionLink({
  handle,
  children,
  className,
}: {
  handle: string
  children?: ReactNode
  className?: string
}) {
  const { profile, onOpen } = useProfileFetch(handle)

  return (
    <PreviewCard.Root onOpenChange={onOpen}>
      <PreviewCard.Trigger
        render={
          <Link
            to="/$handle"
            params={{ handle }}
            onClick={(e) => e.stopPropagation()}
          />
        }
        className={cn("text-link outline-none hover:underline", className)}
      >
        {children ?? `@${handle}`}
      </PreviewCard.Trigger>
      <PreviewCard.Content side="bottom" align="center" sideOffset={8}>
        {profile ? (
          <ProfileContent handle={handle} profile={profile} />
        ) : (
          <div className="flex items-center justify-center p-6">
            <div className="border-t-primary size-5 animate-spin rounded-full border-2 border-neutral" />
          </div>
        )}
      </PreviewCard.Content>
    </PreviewCard.Root>
  )
}

/**
 * An avatar that shows an author hover card on hover.
 * Can be used standalone or inside a PreviewCard.Group for smooth transitions.
 */
export function AvatarWithHoverCard({
  handle,
  displayName,
  avatarUrl,
  size = "md",
  className,
}: {
  handle: string
  displayName?: string | null
  avatarUrl?: string | null
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}) {
  const { profile, onOpen } = useProfileFetch(handle)
  const initial = (displayName ?? handle).slice(0, 1).toUpperCase()

  return (
    <PreviewCard.Root onOpenChange={onOpen}>
      <PreviewCard.Trigger
        render={
          <Link
            to="/$handle"
            params={{ handle }}
            onClick={(e) => e.stopPropagation()}
          />
        }
        className={cn(
          "rounded-full transition outline-none hover:opacity-80",
          className
        )}
        aria-label={`View @${handle}`}
      >
        <Avatar initial={initial} src={avatarUrl} size={size} />
      </PreviewCard.Trigger>
      <PreviewCard.Content side="bottom" align="center" sideOffset={8}>
        {profile ? (
          <ProfileContent handle={handle} profile={profile} />
        ) : (
          <div className="flex items-center justify-center p-6">
            <div className="border-t-primary size-5 animate-spin rounded-full border-2 border-neutral" />
          </div>
        )}
      </PreviewCard.Content>
    </PreviewCard.Root>
  )
}
