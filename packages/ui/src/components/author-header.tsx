import { useCallback, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Avatar } from "./avatar"
import { Button } from "./button"
import { PreviewCard } from "./preview-card"
import { VerifiedBadge, resolveBadgeTier } from "./verified-badge"
import type { ReactNode } from "react"

export interface AuthorHeaderAuthor {
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  isVerified?: boolean
  isContributor?: boolean
  role?: "user" | "admin" | "owner" | null
}

export interface AuthorHeaderProfile {
  bio: string | null
  followers: number
  following: number
  isFollowing?: boolean
  onFollowToggle?: (follow: boolean) => Promise<void>
}

export interface AuthorHeaderProps {
  author: AuthorHeaderAuthor
  /** Already-fetched profile data for the hover card */
  authorProfile?: AuthorHeaderProfile
  /** Lazy fetch profile data on hover */
  onFetchAuthorProfile?: () => Promise<AuthorHeaderProfile>
  /** Called when the author name or avatar is clicked */
  onAuthorClick?: () => void
  /** Timestamp string to show after the handle */
  time?: string
  /** Extra content after the time (e.g. a suffix like "· replied to your post") */
  suffix?: ReactNode
  className?: string
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function AuthorHeader({
  author,
  authorProfile: externalProfile,
  onFetchAuthorProfile,
  onAuthorClick,
  time,
  suffix,
  className,
}: AuthorHeaderProps) {
  const [fetchedProfile, setFetchedProfile] =
    useState<AuthorHeaderProfile | null>(null)
  const authorProfile = externalProfile ?? fetchedProfile
  const hasHoverCard = Boolean(authorProfile || onFetchAuthorProfile)

  const handleHoverCardOpen = useCallback(
    (open: boolean) => {
      if (open && !authorProfile && onFetchAuthorProfile) {
        onFetchAuthorProfile()
          .then(setFetchedProfile)
          .catch(() => {})
      }
    },
    [authorProfile, onFetchAuthorProfile]
  )

  const displayName = author.displayName || author.handle || "unknown"
  const tier = resolveBadgeTier(author)
  const badge = tier ? <VerifiedBadge size={15} role={tier} /> : null

  const nameContent = (
    <>
      {displayName}
      {badge}
    </>
  )

  return (
    <div className={cn("flex items-baseline gap-1.5 text-sm", className)}>
      {hasHoverCard ? (
        <PreviewCard.Root onOpenChange={handleHoverCardOpen}>
          <PreviewCard.Trigger
            render={<span />}
            className={cn(
              "flex items-center gap-1 truncate font-semibold text-primary outline-none",
              onAuthorClick && "cursor-pointer hover:underline"
            )}
            onClick={(e) => {
              e.stopPropagation()
              onAuthorClick?.()
            }}
          >
            {nameContent}
          </PreviewCard.Trigger>
          <PreviewCard.Content side="bottom" align="center" sideOffset={8}>
            {authorProfile ? (
              <AuthorHoverContent
                author={author}
                profile={authorProfile}
                onAuthorClick={onAuthorClick}
              />
            ) : (
              <div className="flex items-center justify-center p-6">
                <div className="border-t-primary size-5 animate-spin rounded-full border-2 border-neutral" />
              </div>
            )}
          </PreviewCard.Content>
        </PreviewCard.Root>
      ) : (
        <span
          className={cn(
            "flex items-center gap-1 truncate font-semibold text-primary",
            onAuthorClick && "cursor-pointer hover:underline"
          )}
          onClick={(e) => {
            e.stopPropagation()
            onAuthorClick?.()
          }}
        >
          {nameContent}
        </span>
      )}
      {author.handle && (
        <span className="truncate text-tertiary">@{author.handle}</span>
      )}
      {time && (
        <>
          <span className="text-tertiary">&middot;</span>
          <span className="shrink-0 text-tertiary">{time}</span>
        </>
      )}
      {suffix}
    </div>
  )
}

function AuthorHoverContent({
  author,
  profile,
  onAuthorClick,
}: {
  author: AuthorHeaderAuthor
  profile: AuthorHeaderProfile
  onAuthorClick?: () => void
}) {
  const [isFollowing, setIsFollowing] = useState(profile.isFollowing)
  const [followerCount, setFollowerCount] = useState(profile.followers)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const displayName = author.displayName || author.handle || "unknown"
  const tier = resolveBadgeTier(author)

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between">
        <div
          className={cn(onAuthorClick && "cursor-pointer")}
          onClick={(e) => {
            e.stopPropagation()
            onAuthorClick?.()
          }}
        >
          <Avatar
            initial={displayName[0] ?? "?"}
            src={author.avatarUrl}
            size="xl"
          />
        </div>
        {isFollowing !== undefined && profile.onFollowToggle && (
          <Button
            size="sm"
            variant={isFollowing ? "outline" : "primary"}
            disabled={busy}
            onClick={async (e) => {
              e.stopPropagation()
              if (busyRef.current) return
              busyRef.current = true
              setBusy(true)
              const next = !isFollowing
              setIsFollowing(next)
              setFollowerCount((c) => c + (next ? 1 : -1))
              try {
                await profile.onFollowToggle?.(next)
              } catch {
                setIsFollowing(!next)
                setFollowerCount((c) => c + (next ? -1 : 1))
              } finally {
                busyRef.current = false
                setBusy(false)
              }
            }}
          >
            {isFollowing ? "Following" : "Follow"}
          </Button>
        )}
      </div>
      <div className="min-w-0">
        <span
          className={cn(
            "flex items-center gap-1 text-sm font-semibold text-primary",
            onAuthorClick && "cursor-pointer hover:underline"
          )}
          onClick={(e) => {
            e.stopPropagation()
            onAuthorClick?.()
          }}
        >
          {displayName}
          {tier ? <VerifiedBadge size={15} role={tier} /> : null}
        </span>
        <span className="text-xs text-tertiary">@{author.handle}</span>
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
