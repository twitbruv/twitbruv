import { URL_PATTERN, trimTrailingPunct } from '@workspace/url-unfurl-core/text'

export type YouTubeChannelSpecifier =
  | { type: 'id'; id: string }
  | { type: 'handle'; handle: string }
  | { type: 'path'; path: string }

export type YouTubeRef =
  | { kind: 'video'; videoId: string; startSec?: number; playlistId?: string; inferredShort?: boolean }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'channel'; channelSpecifier: YouTubeChannelSpecifier }

export type YouTubeRefWithUrl = YouTubeRef & { url: string; refKey: string }

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{10,}$/

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
  'm.youtube.com',
  'music.youtube.com',
])

function isYoutubeHost(host: string): boolean {
  return HOSTS.has(host.toLowerCase())
}

function normalizePlaylistId(id: string | null): string | null {
  const t = id?.trim()
  if (!t || t.length < 10 || !/^[A-Za-z0-9_-]+$/.test(t)) return null
  return t
}

export function parseStartSec(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined
  const s = raw.replace(/^[\s?t=]+/i, '').replace(/^start=/i, '').trim()
  if (!s) return undefined
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10)
  let sec = 0
  let m: RegExpExecArray | null
  const pattern = /(\d+)(h|m|s)/gi
  while ((m = pattern.exec(s)) !== null) {
    const n = Number(m[1])
    const unit = m[2]!.toLowerCase()
    if (unit === 'h') sec += n * 3600
    else if (unit === 'm') sec += n * 60
    else sec += n
  }
  return sec > 0 ? sec : undefined
}

export function parseYouTubeUrl(raw: string): YouTubeRef | null {
  const trimmed = trimTrailingPunct(raw)
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!isYoutubeHost(u.host)) return null

  const host = u.host.toLowerCase()

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const seg = u.pathname.replace(/^\//, '').split('/')[0]
    if (!seg || !VIDEO_ID_RE.test(seg)) return null
    const start = parseStartSec(u.searchParams.get('t'))
    return start !== undefined
      ? { kind: 'video', videoId: seg, startSec: start }
      : { kind: 'video', videoId: seg }
  }

  const pathParts = u.pathname.split('/').filter(Boolean)
  const pv = pathParts[0]?.toLowerCase()

  if (pv === 'playlist')
    return (() => {
      const listId = normalizePlaylistId(u.searchParams.get('list') ?? '')
      if (!listId) return null
      return { kind: 'playlist', playlistId: listId }
    })()

  const listFromWatch = normalizePlaylistId(u.searchParams.get('list') ?? '')
  const qv = u.searchParams.get('v')
  if (qv && VIDEO_ID_RE.test(qv)) {
    const start = parseStartSec(u.searchParams.get('start') ?? u.searchParams.get('t'))
    return {
      kind: 'video',
      videoId: qv,
      ...(start !== undefined ? { startSec: start } : {}),
      ...(listFromWatch ? { playlistId: listFromWatch } : {}),
    }
  }

  if (!qv && normalizePlaylistId(u.searchParams.get('list') ?? '')) {
    const onlyList = normalizePlaylistId(u.searchParams.get('list') ?? '')
    if (onlyList) return { kind: 'playlist', playlistId: onlyList }

    return null
  }

  if (pv === 'shorts' && pathParts[1]) {
    const id = pathParts[1]!.split('?')[0] ?? ''
    if (!VIDEO_ID_RE.test(id)) return null
    return { kind: 'video', videoId: id, inferredShort: true }
  }

  if (pv === 'live' || pv === 'embed' || pv === 'v') {
    const id = pathParts[1]?.split('?')[0] ?? ''
    if (!VIDEO_ID_RE.test(id)) return null
    const start = parseStartSec(u.searchParams.get('start') ?? u.searchParams.get('t'))
    return start !== undefined
      ? { kind: 'video', videoId: id, startSec: start }
      : { kind: 'video', videoId: id }
  }

  if (pv?.startsWith('@')) {
    const handle = pathParts[0]!.slice(1).replace(/[^\w.-]/g, '')
    if (handle.length < 1) return null
    return { kind: 'channel', channelSpecifier: { type: 'handle', handle } }
  }

  if (pv === 'channel' && pathParts[1]) {
    const cid = pathParts[1]!.split('?')[0] ?? ''
    if (CHANNEL_ID_RE.test(cid)) return { kind: 'channel', channelSpecifier: { type: 'id', id: cid } }

    return null
  }

  if (pv === 'c' && pathParts[1])
    return { kind: 'channel', channelSpecifier: { type: 'path', path: `/${pathParts.slice(0, 2).join('/')}` } }

  if (pv === 'user' && pathParts[1])
    return {
      kind: 'channel',
      channelSpecifier: { type: 'path', path: `/${pathParts.slice(0, 2).join('/')}` },
    }

  return null
}

export function refKeyFor(ref: YouTubeRef): string {
  switch (ref.kind) {
    case 'video':
      return `youtube_video:${ref.videoId}`
    case 'playlist':
      return `youtube_playlist:${ref.playlistId}`
    case 'channel': {
      const s = ref.channelSpecifier
      if (s.type === 'id') return `youtube_channel:${s.id}`
      if (s.type === 'handle') return `youtube_channel:h:${s.handle.toLowerCase()}`
      return `youtube_channel:p:${s.path.replace(/\s+/g, '').toLowerCase()}`
    }
  }
}

export function canonicalizeYouTubeUrl(ref: YouTubeRef): string {
  switch (ref.kind) {
    case 'video':
      return `https://www.youtube.com/watch?v=${ref.videoId}`
    case 'playlist':
      return `https://www.youtube.com/playlist?list=${ref.playlistId}`
    case 'channel': {
      const s = ref.channelSpecifier
      if (s.type === 'id') return `https://www.youtube.com/channel/${s.id}`
      if (s.type === 'handle') return `https://www.youtube.com/@${encodeURIComponent(s.handle)}`
      return `https://www.youtube.com${s.path}`
    }
  }
}

export function extractYouTubeRefs(text: string): Array<YouTubeRefWithUrl> {
  const seen = new Set<string>()
  const out: Array<YouTubeRefWithUrl> = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const ref = parseYouTubeUrl(rawUrl)
    if (!ref) continue
    const key = refKeyFor(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...ref, url: trimTrailingPunct(rawUrl), refKey: key })
  }
  return out
}
