import { PlayIcon } from "@heroicons/react/24/solid"
import { cn } from "../lib/utils"
import { Avatar } from "./avatar"
import { LinkCardShell, linkCardShellClasses } from "./link-card"

function compactNumber(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function formatDuration(sec: number | null): string | null {
  if (sec == null || sec <= 0) return null
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function YoutubeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" aria-hidden className={className}>
      <path
        fill="#FF0000"
        d="M27.4 3.1a3.5 3.5 0 0 0-2.5-2.5C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9Z"
      />
      <path fill="#fff" d="m11.2 14.3 7.2-4.3-7.2-4.3v8.6Z" />
    </svg>
  )
}

function YoutubeChromeHeader({
  channelTitle,
}: {
  channelTitle?: string | null
}) {
  return (
    <div className="flex items-center gap-2 border-b border-neutral bg-base-2/60 px-3 py-1.5 text-sm text-tertiary">
      <YoutubeMark className="h-3 w-auto" />
      {channelTitle && <span className="truncate">{channelTitle}</span>}
    </div>
  )
}

// ── Video ─────────────────────────────────────────────

export interface YoutubeVideoCardProps {
  url: string
  title: string
  channelTitle?: string | null
  thumbnailUrl?: string | null
  thumbnailWidth?: number | null
  thumbnailHeight?: number | null
  durationSec?: number | null
  viewCount?: number | null
  likeCount?: number | null
  commentCount?: number | null
  isShort?: boolean
  isLive?: boolean
  onPlay?: (e: React.MouseEvent) => void
  className?: string
}

export function YoutubeVideoCard({
  url,
  title,
  channelTitle,
  thumbnailUrl,
  thumbnailWidth,
  thumbnailHeight,
  durationSec,
  viewCount,
  likeCount,
  commentCount,
  isShort,
  isLive,
  onPlay,
  className,
}: YoutubeVideoCardProps) {
  const duration = formatDuration(durationSec ?? null)

  return (
    <div
      className={cn("relative", isShort && "mx-auto max-w-[280px]", className)}
    >
      <div className={cn(linkCardShellClasses, "p-0", isShort && "mt-3")}>
        <YoutubeChromeHeader channelTitle={channelTitle} />
        <div
          className={cn(
            "relative w-full bg-black",
            isShort ? "aspect-[9/16]" : "aspect-video"
          )}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              width={thumbnailWidth ?? undefined}
              height={thumbnailHeight ?? undefined}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-neutral-400">
              No thumbnail
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          {duration && (
            <span className="absolute right-2 bottom-2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {duration}
            </span>
          )}
          {isLive && (
            <span className="absolute bottom-2 left-2 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
              Live
            </span>
          )}
          <button
            type="button"
            data-post-card-ignore-open
            onClick={onPlay}
            className="absolute inset-0 flex cursor-pointer items-center justify-center"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-black/80">
              <PlayIcon className="size-8 translate-x-0.5" />
            </span>
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          data-post-card-ignore-open
          onClick={(e) => e.stopPropagation()}
          className="block space-y-1 p-3 hover:bg-base-2/30"
        >
          <h3 className="line-clamp-2 text-sm font-semibold text-primary">
            {title}
          </h3>
          {(viewCount != null || likeCount != null || commentCount != null) && (
            <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-tertiary">
              {viewCount != null && (
                <span>{compactNumber(viewCount)} views</span>
              )}
              {likeCount != null && (
                <span>{compactNumber(likeCount)} likes</span>
              )}
              {commentCount != null && (
                <span>{compactNumber(commentCount)} comments</span>
              )}
            </p>
          )}
        </a>
      </div>
    </div>
  )
}

// ── Playlist ──────────────────────────────────────────

export interface YoutubePlaylistCardProps {
  url: string
  title: string
  channelTitle?: string | null
  thumbnailUrl?: string | null
  itemCount?: number | null
  onPlay?: (e: React.MouseEvent) => void
  className?: string
}

export function YoutubePlaylistCard({
  url,
  title,
  channelTitle,
  thumbnailUrl,
  itemCount,
  onPlay,
  className,
}: YoutubePlaylistCardProps) {
  return (
    <div className={cn("mt-3 max-w-[560px]", className)}>
      <div className={cn(linkCardShellClasses, "p-0")}>
        <YoutubeChromeHeader channelTitle={channelTitle} />
        <div className="relative aspect-video w-full bg-black">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-neutral-400">
              Playlist
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          <button
            type="button"
            data-post-card-ignore-open
            onClick={onPlay}
            className="absolute inset-0 flex cursor-pointer items-center justify-center"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-black/80">
              <PlayIcon className="size-8 translate-x-0.5" />
            </span>
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          data-post-card-ignore-open
          onClick={(e) => e.stopPropagation()}
          className="block space-y-1 p-3 hover:bg-base-2/30"
        >
          <h3 className="line-clamp-2 text-sm font-semibold text-primary">
            {title}
          </h3>
          {itemCount != null && (
            <p className="text-sm text-tertiary">{itemCount} videos</p>
          )}
        </a>
      </div>
    </div>
  )
}

// ── Channel ───────────────────────────────────────────

export interface YoutubeChannelCardProps {
  url: string
  title: string
  handle?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  subscriberCount?: number | null
  videoCount?: number | null
  className?: string
}

export function YoutubeChannelCard({
  url,
  title,
  handle,
  avatarUrl,
  bannerUrl,
  subscriberCount,
  videoCount,
  className,
}: YoutubeChannelCardProps) {
  return (
    <LinkCardShell href={url} className={cn("p-0", className)}>
      <YoutubeChromeHeader channelTitle={title} />
      <div className="relative h-24 w-full overflow-hidden bg-base-2">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="flex gap-3 p-3">
        <Avatar initial={title.charAt(0)} src={avatarUrl} size="xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="truncate text-sm font-semibold text-primary">
            {title}
          </h3>
          {handle && <p className="text-sm text-tertiary">@{handle}</p>}
          <div className="flex flex-wrap gap-3 text-sm text-tertiary">
            {subscriberCount != null && (
              <span>{compactNumber(subscriberCount)} subscribers</span>
            )}
            {videoCount != null && (
              <span>{compactNumber(videoCount)} videos</span>
            )}
          </div>
        </div>
      </div>
    </LinkCardShell>
  )
}
