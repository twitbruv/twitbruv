import type { Database } from "@workspace/db"
import {
  applyUnfurlSuccess,
  classifyHttpError,
  persistFailureOnly,
  type FetchOutcome as CoreFetchOutcome,
} from "@workspace/url-unfurl-core"
import {
  listChannels,
  listPlaylistItems,
  listPlaylists,
  listVideos,
  parseISO8601Duration,
  searchList,
  type YtThumbnail,
  type YtChannelsResponse,
  type YtPlaylistsResponse,
  type YtPlaylistItemsResponse,
  type YtVideosResponse,
} from "./api.ts"
import type {
  YouTubeCard,
  YouTubeChannelCard,
  YouTubePlaylistCard,
  YouTubeVideoCard,
} from "./card.ts"
import { canonicalizeYouTubeUrl, type YouTubeRef } from "./urls.ts"

export type FetchOutcome<TCard extends YouTubeCard = YouTubeCard> =
  CoreFetchOutcome<TCard>

async function ytOk<T>(p: Promise<unknown>): Promise<T> {
  const j = await p
  const o = j as { error?: { code?: number; message?: string } }
  if (o?.error?.code)
    throw Object.assign(new Error(o.error.message ?? "youtube_api_error"), {
      status: o.error.code,
    })
  return j as T
}

function bestThumb(
  thumbs?: Record<string, YtThumbnail | undefined>
): YtThumbnail {
  const keys = ["maxres", "standard", "high", "medium", "default"]
  for (const k of keys) {
    const v = thumbs?.[k]
    if (v?.url) return v
  }
  const hit = thumbs
    ? Object.values(thumbs).find((x): x is YtThumbnail => Boolean(x?.url))
    : undefined
  return hit ?? { url: "" }
}

function excerpt(body: string | null | undefined, max = 400): string | null {
  if (!body) return null
  const t = body.trim()
  if (!t.length) return null
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

function ttlSecForCard(card: YouTubeCard): number {
  if (card.kind === "youtube_playlist") return 60 * 60
  if (card.kind === "youtube_channel") return 60 * 60 * 24
  return card.kind === "youtube_video" && card.isLive ? 60 * 5 : 60 * 60 * 24
}

function videoWatchUrl(ref: Extract<YouTubeRef, { kind: "video" }>): string {
  const base = canonicalizeYouTubeUrl(ref)
  if (ref.playlistId) {
    try {
      const u = new URL(base)
      u.searchParams.set("list", ref.playlistId)
      return u.toString()
    } catch {
      return base
    }
  }
  return base
}

/** Portrait thumbnail heuristic; API path also requires short duration when known. */
function guessIsYoutubeShortVideo(
  ref: Extract<YouTubeRef, { kind: "video" }>,
  meta: {
    thumbnailWidth: number | null | undefined
    thumbnailHeight: number | null | undefined
    /** When set (including null), duration must be ≤62s for the portrait thumb to count. */
    durationSec?: number | null
  }
): boolean {
  if (ref.inferredShort) return true
  const w = meta.thumbnailWidth
  const h = meta.thumbnailHeight
  const portrait =
    typeof w === "number" && typeof h === "number" && h > 0 && w > 0 && h > w
  if (!portrait) return false
  if (meta.durationSec === undefined) return true
  return meta.durationSec !== null && meta.durationSec <= 62
}

const OEMBED_FETCH_TIMEOUT_MS = 5000

function channelMetaFromAuthorUrl(authorUrl: string | undefined): {
  channelId: string
  channelHandle: string | null
} {
  if (!authorUrl) return { channelId: "", channelHandle: null }
  try {
    const u = new URL(authorUrl)
    const ch = u.pathname.match(/\/channel\/(UC[A-Za-z0-9_-]{10,})/i)
    if (ch?.[1]) return { channelId: ch[1], channelHandle: null }
    const h = u.pathname.match(/^\/@([^/?#]+)/)
    if (h?.[1])
      return { channelId: "", channelHandle: decodeURIComponent(h[1]) }
  } catch {}
  return { channelId: "", channelHandle: null }
}

async function fetchVideoOEmbed(
  ref: Extract<YouTubeRef, { kind: "video" }>
): Promise<FetchOutcome<YouTubeVideoCard>> {
  const cardUrl = videoWatchUrl(ref)
  const oembedUrl = new URL("https://www.youtube.com/oembed")
  oembedUrl.searchParams.set("url", cardUrl)
  oembedUrl.searchParams.set("format", "json")

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    OEMBED_FETCH_TIMEOUT_MS
  )
  let res: Response
  try {
    res = await fetch(oembedUrl.toString(), {
      redirect: "follow",
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "unknown", message: "oembed_timeout" }
    }
    return { ok: false, ...classifyHttpError(err) }
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status === 404) {
    return { ok: false, reason: "not_found", message: "video_not_found" }
  }
  if (!res.ok) {
    return {
      ok: false,
      reason:
        res.status === 401 || res.status === 403 ? "unauthorized" : "unknown",
      message: `oembed_http_${res.status}`,
    }
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: "unknown", message: "oembed_json_invalid" }
  }

  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "unknown", message: "oembed_json_invalid" }
  }

  const j = body as Record<string, unknown>
  const rawThumb = j["thumbnail_url"]
  if (typeof rawThumb !== "string" || rawThumb.trim().length === 0) {
    return { ok: false, reason: "unknown", message: "oembed_json_invalid" }
  }
  const thumb = rawThumb.trim()

  const rawAuthorUrl = j["author_url"]
  const authorUrlStr =
    typeof rawAuthorUrl === "string" ? rawAuthorUrl : undefined
  const { channelId, channelHandle } = channelMetaFromAuthorUrl(authorUrlStr)

  const rawTitle = j["title"]
  const title = (typeof rawTitle === "string" ? rawTitle.trim() : "") || cardUrl

  const rawAuthorName = j["author_name"]
  const channelTitle =
    typeof rawAuthorName === "string" ? rawAuthorName.trim() : ""

  const rawTw = j["thumbnail_width"]
  const rawTh = j["thumbnail_height"]
  const tw = typeof rawTw === "number" ? rawTw : null
  const th = typeof rawTh === "number" ? rawTh : null
  const isShortGuess = guessIsYoutubeShortVideo(ref, {
    thumbnailWidth: tw,
    thumbnailHeight: th,
  })

  const startSec: number | null =
    ref.startSec !== undefined ? ref.startSec : null

  const card: YouTubeVideoCard = {
    kind: "youtube_video",
    url: cardUrl,
    videoId: ref.videoId,
    title,
    description: null,
    channelId,
    channelTitle,
    channelHandle,
    channelAvatarUrl: null,
    thumbnailUrl: thumb,
    thumbnailWidth: tw,
    thumbnailHeight: th,
    durationSec: null,
    viewCount: null,
    likeCount: null,
    commentCount: null,
    publishedAt: null,
    isShort: isShortGuess,
    isLive: false,
    embeddable: true,
    startSec,
    playlistId: ref.playlistId ?? null,
  }

  return {
    ok: true,
    result: {
      card,
      title,
      description: null,
      imageUrl: thumb,
    },
  }
}

async function fetchVideo(
  ref: Extract<YouTubeRef, { kind: "video" }>,
  apiKey: string
): Promise<FetchOutcome<YouTubeVideoCard>> {
  const raw = await ytOk<YtVideosResponse>(
    listVideos(
      [
        "snippet",
        "contentDetails",
        "statistics",
        "status",
        "liveStreamingDetails",
      ],
      ref.videoId,
      apiKey
    )
  )
  const it = raw.items?.[0]
  const snip = it?.snippet
  if (!it || !snip)
    return { ok: false, reason: "not_found", message: "video_not_found" }

  const t = bestThumb(snip.thumbnails ?? {})

  let channelAvatarUrl: string | null = null
  let channelHandle: string | null = null
  if (snip.channelId) {
    try {
      const ch = await ytOk<YtChannelsResponse>(
        listChannels(["snippet"], apiKey, { id: snip.channelId })
      )
      const ch0 = ch.items?.[0]
      channelAvatarUrl = bestThumb(ch0?.snippet?.thumbnails)?.url ?? null
      channelHandle = ch0?.snippet?.channelHandle ?? null
    } catch {
      channelAvatarUrl = null
    }
  }

  const durationIso = it.contentDetails?.duration ?? null
  const durationSec = parseISO8601Duration(durationIso)
  const liveState = snip.liveBroadcastContent
  const isLive =
    liveState === "live" ||
    liveState === "upcoming" ||
    Boolean(it.liveStreamingDetails)

  const isShortGuess = guessIsYoutubeShortVideo(ref, {
    thumbnailWidth: t.width,
    thumbnailHeight: t.height,
    durationSec,
  })

  const embeddable = it.status?.embeddable !== false
  const startSec: number | null =
    ref.startSec !== undefined ? ref.startSec : null
  const cardUrl = videoWatchUrl(ref)
  const title = snip.title ?? ""

  const card: YouTubeVideoCard = {
    kind: "youtube_video",
    url: cardUrl,
    videoId: ref.videoId,
    title,
    description: excerpt(snip.description),
    channelId: snip.channelId ?? "",
    channelTitle: snip.channelTitle ?? "",
    channelHandle,
    channelAvatarUrl,
    thumbnailUrl: t.url,
    thumbnailWidth: t.width ?? null,
    thumbnailHeight: t.height ?? null,
    durationSec,
    viewCount:
      it.statistics?.viewCount != null ? Number(it.statistics.viewCount) : null,
    likeCount:
      it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
    commentCount:
      it.statistics?.commentCount != null
        ? Number(it.statistics.commentCount)
        : null,
    publishedAt: snip.publishedAt ?? null,
    isShort: isShortGuess,
    isLive,
    embeddable,
    startSec,
    playlistId: ref.playlistId ?? null,
  }

  return {
    ok: true,
    result: {
      card,
      title: title || cardUrl,
      description: excerpt(snip.description, 280),
      imageUrl: t.url || channelAvatarUrl,
    },
  }
}

async function fetchPlaylist(
  ref: Extract<YouTubeRef, { kind: "playlist" }>,
  apiKey: string
): Promise<FetchOutcome<YouTubePlaylistCard>> {
  const raw = await ytOk<YtPlaylistsResponse>(
    listPlaylists(["snippet", "contentDetails"], ref.playlistId, apiKey)
  )
  const pl = raw.items?.[0]
  const snip = pl?.snippet
  if (!pl || !snip)
    return { ok: false, reason: "not_found", message: "playlist_not_found" }

  const items = await ytOk<YtPlaylistItemsResponse>(
    listPlaylistItems(["snippet", "contentDetails"], ref.playlistId, apiKey)
  )
  const row0 = items.items?.[0]
  const firstVid =
    row0?.contentDetails?.videoId ?? row0?.snippet?.resourceId?.videoId ?? null

  const thumbs = snip.thumbnails ?? {}
  const t = bestThumb(thumbs)

  let itemCount: number | null = null
  const ic = pl.contentDetails?.itemCount
  if (typeof ic === "number") itemCount = ic
  else if (typeof ic === "string") itemCount = Number(ic) || null

  const cardUrl = canonicalizeYouTubeUrl(ref)
  const title = snip.title ?? ""

  const card: YouTubePlaylistCard = {
    kind: "youtube_playlist",
    url: cardUrl,
    playlistId: ref.playlistId,
    title,
    description: excerpt(snip.description),
    itemCount,
    channelTitle: snip.channelTitle ?? null,
    channelId: snip.channelId ?? null,
    thumbnailUrl: t.url || null,
    firstVideoId: firstVid,
  }

  return {
    ok: true,
    result: {
      card,
      title: title || cardUrl,
      description: excerpt(snip.description, 280),
      imageUrl: t.url || null,
    },
  }
}

async function fetchChannel(
  ref: Extract<YouTubeRef, { kind: "channel" }>,
  apiKey: string
): Promise<FetchOutcome<YouTubeChannelCard>> {
  const spec = ref.channelSpecifier
  let channelId: string | undefined
  if (spec.type === "id") channelId = spec.id
  else if (spec.type === "handle") {
    const r = await ytOk<YtChannelsResponse>(
      listChannels(["snippet", "statistics", "brandingSettings"], apiKey, {
        forHandle: spec.handle,
      })
    )
    channelId = r.items?.[0]?.id
  } else {
    const q = spec.path.replace(/^\//, "").split("/").filter(Boolean).join(" ")
    const s = (await ytOk(
      searchList(["snippet"], apiKey, { type: "channel", q, maxResults: "1" })
    )) as { items?: Array<{ id?: { channelId?: string } }> }
    channelId = s.items?.[0]?.id?.channelId
  }
  if (!channelId)
    return { ok: false, reason: "not_found", message: "channel_not_found" }

  const full = await ytOk<YtChannelsResponse>(
    listChannels(["snippet", "statistics", "brandingSettings"], apiKey, {
      id: channelId,
    })
  )

  const ch = full.items?.[0]
  const snip = ch?.snippet
  if (!ch?.id || !snip)
    return { ok: false, reason: "not_found", message: "channel_resolve_failed" }

  const av = bestThumb(snip.thumbnails)
  const bannerUrl =
    snip.bannerExternalUrl ??
    ch.brandingSettings?.image?.bannerExternalUrl ??
    null
  const handleOut: string | null = snip.channelHandle ?? null
  const cardUrl = canonicalizeYouTubeUrl({
    kind: "channel",
    channelSpecifier: { type: "id", id: ch.id },
  })
  const title = snip.localized?.title ?? snip.title ?? handleOut ?? ""
  const desc = excerpt(snip.localized?.description ?? snip.description)
  const subs = ch.statistics?.subscriberCount
    ? Number(ch.statistics.subscriberCount)
    : null
  const vc = ch.statistics?.videoCount ? Number(ch.statistics.videoCount) : null

  const card: YouTubeChannelCard = {
    kind: "youtube_channel",
    url: cardUrl,
    channelId: ch.id,
    handle: handleOut,
    title,
    description: desc,
    avatarUrl: av.url || null,
    bannerUrl,
    subscriberCount: subs,
    videoCount: vc,
  }

  return {
    ok: true,
    result: {
      card,
      title,
      description: excerpt(snip.description, 280),
      imageUrl: av.url || null,
    },
  }
}

export async function fetchYouTubeCard(
  ref: YouTubeRef,
  apiKey: string | undefined
): Promise<FetchOutcome<YouTubeCard>> {
  try {
    if (!apiKey || apiKey.length === 0) {
      if (ref.kind === "video") return await fetchVideoOEmbed(ref)
      return {
        ok: false,
        reason: "unauthorized",
        message: "unfurl_token_missing",
      }
    }

    if (ref.kind === "video") return await fetchVideo(ref, apiKey)
    if (ref.kind === "playlist") return await fetchPlaylist(ref, apiKey)
    return await fetchChannel(ref, apiKey)
  } catch (err) {
    return { ok: false, ...classifyHttpError(err) }
  }
}

export async function persistYoutubeCardOutcome(
  db: Database,
  rowId: string,
  outcome: FetchOutcome<YouTubeCard>
): Promise<void> {
  if (!outcome.ok) {
    await persistFailureOnly(db, rowId, outcome.reason, outcome.message)
    return
  }
  await applyUnfurlSuccess(
    db,
    rowId,
    ttlSecForCard(outcome.result.card),
    outcome.result,
    {
      siteName: "YouTube",
      providerName: "YouTube",
    }
  )
}

export { persistFailureOnly } from "@workspace/url-unfurl-core"
