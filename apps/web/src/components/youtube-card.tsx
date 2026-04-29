import {
  YoutubeChannelCard,
  YoutubePlaylistCard,
  YoutubeVideoCard,
} from "@workspace/ui/components/youtube-card"
import { useYouTubePlayer } from "./youtube-player-dialog"
import type { YouTubeCard } from "@workspace/youtube-unfurl/card"
import type { Post } from "../lib/api"

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
      return <VideoCardInner card={card} post={post} className={className} />
    case "youtube_playlist":
      return <PlaylistCardInner card={card} post={post} className={className} />
    case "youtube_channel":
      return (
        <YoutubeChannelCard
          url={card.url}
          title={card.title}
          handle={card.handle}
          avatarUrl={card.avatarUrl}
          bannerUrl={card.bannerUrl}
          subscriberCount={card.subscriberCount}
          videoCount={card.videoCount}
          className={className}
        />
      )
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

  return (
    <YoutubeVideoCard
      url={card.url}
      title={card.title}
      channelTitle={card.channelTitle}
      thumbnailUrl={card.thumbnailUrl}
      thumbnailWidth={card.thumbnailWidth}
      thumbnailHeight={card.thumbnailHeight}
      durationSec={card.durationSec}
      viewCount={card.viewCount}
      likeCount={card.likeCount}
      commentCount={card.commentCount}
      isShort={card.isShort}
      isLive={card.isLive}
      onPlay={onPlay}
      className={className}
    />
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
    <YoutubePlaylistCard
      url={card.url}
      title={card.title}
      channelTitle={card.channelTitle}
      thumbnailUrl={card.thumbnailUrl}
      itemCount={card.itemCount}
      onPlay={onPlay}
      className={className}
    />
  )
}
