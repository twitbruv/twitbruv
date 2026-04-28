export interface YouTubeVideoCard {
  kind: 'youtube_video'
  url: string
  videoId: string
  title: string
  description: string | null
  channelId: string
  channelTitle: string
  channelHandle: string | null
  channelAvatarUrl: string | null
  thumbnailUrl: string
  thumbnailWidth: number | null
  thumbnailHeight: number | null
  durationSec: number | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  publishedAt: string | null
  isShort: boolean
  isLive: boolean
  embeddable: boolean
  startSec: number | null
  playlistId: string | null
}

export interface YouTubePlaylistCard {
  kind: 'youtube_playlist'
  url: string
  playlistId: string
  title: string
  description: string | null
  itemCount: number | null
  channelTitle: string | null
  channelId: string | null
  thumbnailUrl: string | null
  firstVideoId: string | null
}

export interface YouTubeChannelCard {
  kind: 'youtube_channel'
  url: string
  channelId: string
  handle: string | null
  title: string
  description: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  subscriberCount: number | null
  videoCount: number | null
}

export type YouTubeCard = YouTubeVideoCard | YouTubePlaylistCard | YouTubeChannelCard

export function isYouTubeCardKind(s: string | null | undefined): boolean {
  return s === 'youtube_video' || s === 'youtube_playlist' || s === 'youtube_channel'
}
