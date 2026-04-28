const BASE = 'https://www.googleapis.com/youtube/v3'

export function parseISO8601Duration(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso.trim())
  if (!m) return null
  const h = Number(m[1] ?? 0)
  const min = Number(m[2] ?? 0)
  const sec = Number(m[3] ?? 0)
  const total = h * 3600 + min * 60 + sec
  return Number.isFinite(total) ? Math.floor(total) : null
}

function ytUrl(endpoint: string, apiKey: string, query: Record<string, string>): string {
  const url = new URL(`${BASE}/${endpoint}`)
  url.searchParams.set('key', apiKey)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return url.toString()
}

export async function listVideos(parts: Array<string>, id: string, apiKey: string) {
  const res = await fetch(ytUrl('videos', apiKey, { part: parts.join(','), id, maxResults: '1' }))
  return res.json() as Promise<YtVideosResponse>
}

export async function listPlaylists(parts: Array<string>, id: string, apiKey: string) {
  const res = await fetch(ytUrl('playlists', apiKey, { part: parts.join(','), id, maxResults: '1' }))
  return res.json() as Promise<YtPlaylistsResponse>
}

export async function listChannels(parts: Array<string>, apiKey: string, query: Record<string, string>) {
  const res = await fetch(ytUrl('channels', apiKey, { part: parts.join(','), ...query, maxResults: '5' }))
  return res.json() as Promise<YtChannelsResponse>
}

export async function listPlaylistItems(parts: Array<string>, playlistId: string, apiKey: string) {
  const res = await fetch(
    ytUrl('playlistItems', apiKey, { part: parts.join(','), playlistId, maxResults: '1' }),
  )
  return res.json() as Promise<YtPlaylistItemsResponse>
}

export async function searchList(parts: Array<string>, apiKey: string, query: Record<string, string>) {
  const res = await fetch(ytUrl('search', apiKey, { part: parts.join(','), ...query }))
  return res.json() as Promise<YtSearchResponse>
}

export interface YtThumbnail {
  url: string
  width?: number
  height?: number
}

export interface YtVideoSnippet {
  title?: string
  description?: string
  channelId?: string
  channelTitle?: string
  publishedAt?: string
  thumbnails?: Record<string, YtThumbnail | undefined>
  liveBroadcastContent?: string | null
}

export interface YtVideosResponse {
  items?: Array<{
    id?: string
    snippet?: YtVideoSnippet
    contentDetails?: { duration?: string | null }
    statistics?: {
      viewCount?: string | null
      likeCount?: string | null
      commentCount?: string | null
    }
    status?: { embeddable?: boolean }
    liveStreamingDetails?: { concurrentViewers?: string }
  }>
}

export interface YtPlaylistsResponse {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
      description?: string
      channelId?: string
      channelTitle?: string
      thumbnails?: Record<string, YtThumbnail | undefined>
    }
    contentDetails?: { itemCount?: number | string }
  }>
}

export interface YtChannelsResponse {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
      description?: string
      thumbnails?: Record<string, YtThumbnail | undefined>
      bannerExternalUrl?: string
      channelHandle?: string
      customUrl?: string
      publishedAt?: string
      localized?: { description?: string; title?: string }
    }
    statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string | null }
    brandingSettings?: { image?: { bannerExternalUrl?: string } }
  }>
}

export interface YtPlaylistItemsResponse {
  items?: Array<{
    snippet?: {
      resourceId?: { videoId?: string }
      title?: string
      thumbnails?: Record<string, YtThumbnail | undefined>
    }
    contentDetails?: { videoId?: string }
  }>
}

export interface YtSearchResponse {
  items?: Array<{ id?: { channelId?: string; kind?: string }; snippet?: Record<string, unknown> }>
}
