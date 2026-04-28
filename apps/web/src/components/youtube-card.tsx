import { PlayIcon } from "@heroicons/react/24/solid"
import { cn } from "@workspace/ui/lib/utils"
import type { YouTubeCard } from "@workspace/youtube-unfurl/card"
import { UnfurlCardChrome, unfurlCardChromeClasses } from "./unfurl-card-chrome"
import { useYouTubePlayer } from "./youtube-player-dialog"
import type { Post } from "../lib/api"

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
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export function YoutubeCardBlock({
  card,
  post,
  className,
}: {
  card: YouTubeCard & { provider?: "youtube" }
  post: Post
  className?: string
}) {
  switch (card.kind) {
    case "youtube_video":
      return (
        <VideoCardInner card={card} post={post} className={className} />
      )
    case "youtube_playlist":
      return (
        <PlaylistCardInner card={card} post={post} className={className} />
      )
    case "youtube_channel":
      return <ChannelCardInner card={card} className={className} />
    default:
      return null
  }
}

function VideoCardInner({
  card,
  post,
  className,
}: {
  card: Extract<YouTubeCard, { kind: "youtube_video" }>
  post: Post
  className?: string
}) {
  const player = useYouTubePlayer()

  function onPlay(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    player.openYoutube({
      videoId: card.videoId,
      playlistId: card.playlistId,
      startSec: card.startSec ?? null,
      isShort: card.isShort,
      embeddable: card.embeddable,
      watchUrl: card.url,
      contextPost: post,
    })
  }

  const duration = formatDuration(card.durationSec)

  return (
    <div className={cn("relative", card.isShort && "mx-auto max-w-[280px]", className)}>
      <div className={cn(unfurlCardChromeClasses, "p-0", card.isShort && "mt-3")}>
        <div className={cn("relative w-full bg-black", card.isShort ? "aspect-[9/16]" : "aspect-video")}>
          {card.thumbnailUrl ? (
            <img
              src={card.thumbnailUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              width={card.thumbnailWidth ?? undefined}
              height={card.thumbnailHeight ?? undefined}
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
          {card.isLive && (
            <span className="absolute left-2 bottom-2 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
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
          href={card.url}
          target="_blank"
          rel="noreferrer"
          data-post-card-ignore-open
          onClick={(e) => e.stopPropagation()}
          className="block space-y-1 p-3 hover:bg-base-2/30"
        >
          <div className="flex items-center gap-2 text-[11px] text-tertiary">
            <span className="font-semibold tracking-wide text-red-500">YouTube</span>
            {card.channelTitle && <span className="truncate">{card.channelTitle}</span>}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold text-primary">{card.title}</h3>
          {(card.viewCount != null ||
            card.likeCount != null ||
            card.commentCount != null) && (
            <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-tertiary">
              {card.viewCount != null && (
                <span>{compactNumber(card.viewCount)} views</span>
              )}
              {card.likeCount != null && (
                <span>{compactNumber(card.likeCount)} likes</span>
              )}
              {card.commentCount != null && (
                <span>{compactNumber(card.commentCount)} comments</span>
              )}
            </p>
          )}
        </a>
      </div>
    </div>
  )
}

function PlaylistCardInner({
  card,
  post,
  className,
}: {
  card: Extract<YouTubeCard, { kind: "youtube_playlist" }>
  post: Post
  className?: string
}) {
  const player = useYouTubePlayer()
  const vid = card.firstVideoId

  function onPlay(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!vid) {
      window.open(card.url, "_blank", "noopener,noreferrer")
      return
    }
    player.openYoutube({
      videoId: vid,
      playlistId: card.playlistId,
      startSec: null,
      isShort: false,
      embeddable: true,
      watchUrl: card.url,
      contextPost: post,
    })
  }

  return (
    <div className={cn("mt-3 max-w-[560px]", className)}>
      <div className={cn(unfurlCardChromeClasses, "p-0")}>
        <div className="relative aspect-video w-full bg-black">
          {card.thumbnailUrl ? (
            <img
              src={card.thumbnailUrl}
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
          href={card.url}
          target="_blank"
          rel="noreferrer"
          data-post-card-ignore-open
          onClick={(e) => e.stopPropagation()}
          className="block space-y-1 p-3 hover:bg-base-2/30"
        >
          <div className="flex items-center gap-2 text-[11px] text-tertiary">
            <span className="font-semibold tracking-wide text-red-500">YouTube</span>
            {card.channelTitle && <span className="truncate">{card.channelTitle}</span>}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold text-primary">{card.title}</h3>
          {card.itemCount != null && (
            <p className="text-[12px] text-tertiary">{card.itemCount} videos</p>
          )}
        </a>
      </div>
    </div>
  )
}

function ChannelCardInner({
  card,
  className,
}: {
  card: Extract<YouTubeCard, { kind: "youtube_channel" }>
  className?: string
}) {
  return (
    <UnfurlCardChrome href={card.url} className={cn("p-0", className)}>
      <div className="relative h-24 w-full overflow-hidden bg-base-2">
        {card.bannerUrl ? (
          <img src={card.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <div className="flex gap-3 p-3">
        {card.avatarUrl ? (
          <img
            src={card.avatarUrl}
            alt=""
            className="size-12 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="size-12 shrink-0 rounded-full bg-base-2" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-[11px] text-tertiary">
            <span className="font-semibold tracking-wide text-red-500">YouTube</span>
          </div>
          <h3 className="truncate text-sm font-semibold text-primary">{card.title}</h3>
          {card.handle && (
            <p className="text-[12px] text-tertiary">@{card.handle}</p>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-tertiary">
            {card.subscriberCount != null && (
              <span>{compactNumber(card.subscriberCount)} subscribers</span>
            )}
            {card.videoCount != null && <span>{compactNumber(card.videoCount)} videos</span>}
          </div>
        </div>
      </div>
    </UnfurlCardChrome>
  )
}
