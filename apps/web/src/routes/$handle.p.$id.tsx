import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  IconAt,
  IconBookmark,
  IconBookmarkFilled,
  IconChartBar,
  IconDots,
  IconHash,
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconPhoto,
  IconRepeat,
} from "@tabler/icons-react"
import { ApiError, api } from "../lib/api"
import { useSubmitHotkey } from "../lib/hotkeys"
import { Avatar } from "../components/avatar"
import { RichText } from "../components/rich-text"
import { useMe } from "../lib/me"
import type { Post, Thread } from "../lib/api"

type ThreadSearch = {
  from?: "home"
  homePostId?: string
  homePostHandle?: string
}

export const Route = createFileRoute("/$handle/p/$id")({
  component: ThreadView,
  validateSearch: (search: Record<string, unknown>): ThreadSearch => ({
    from: search.from === "home" ? "home" : undefined,
    homePostId:
      typeof search.homePostId === "string" ? search.homePostId : undefined,
    homePostHandle:
      typeof search.homePostHandle === "string"
        ? search.homePostHandle
        : undefined,
  }),
})

function ThreadView() {
  const { handle, id } = Route.useParams()
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setThread(null)
    setError(null)
    api
      .thread(id)
      .then(setThread)
      .catch((e) => setError(e instanceof ApiError ? e.message : "not found"))
  }, [id])

  function replace(next: Post) {
    setThread((t) =>
      t
        ? {
            ancestors: t.ancestors.map((p) => (p.id === next.id ? next : p)),
            post: t.post && t.post.id === next.id ? next : t.post,
            replies: t.replies.map((p) => (p.id === next.id ? next : p)),
          }
        : t
    )
  }

  function onReply(post: Post) {
    setThread((t) =>
      t
        ? {
            ...t,
            post: t.post
              ? {
                  ...t.post,
                  counts: {
                    ...t.post.counts,
                    replies: t.post.counts.replies + 1,
                  },
                }
              : t.post,
            replies: [...t.replies, post],
          }
        : t
    )
  }

  if (error) {
    return (
      <main>
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">post not found</p>
          <Link
            to="/$handle"
            params={{ handle }}
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            back to @{handle}
          </Link>
        </div>
      </main>
    )
  }

  if (!thread) {
    return (
      <main>
        <div className="px-4 py-16">
          <p className="text-sm text-muted-foreground">loading…</p>
        </div>
      </main>
    )
  }

  const hasAncestors = thread.ancestors.length > 0

  return (
    <main>
      {hasAncestors && (
        <div>
          {thread.ancestors.map((p) => (
            <AncestorPost
              key={p.id}
              post={p}
              onChange={replace}
              showLineBelow={true}
            />
          ))}
        </div>
      )}

      {thread.post && (
        <ParentPost
          post={thread.post}
          onChange={replace}
          hasAncestors={hasAncestors}
        />
      )}

      <ReplyComposer postId={id} onReply={onReply} />

      {thread.replies.length > 0 && (
        <div>
          {thread.replies.map((p) => (
            <Link
              key={p.id}
              to="/$handle/p/$id"
              params={{ handle: p.author.handle ?? "", id: p.id }}
              className="block border-b border-border py-3 pr-4 pl-8 transition-colors hover:bg-muted/30"
            >
              <ReplyCard post={p} onChange={replace} />
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

function AncestorPost({
  post,
  onChange,
  showLineBelow,
}: {
  post: Post
  onChange: (p: Post) => void
  showLineBelow: boolean
}) {
  const [busy, setBusy] = useState(false)
  const authorHandle = post.author.handle
  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  function relativeTime(iso: string): string {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const dd = Math.floor(h / 24)
    if (dd < 7) return `${dd}d`
    return new Date(iso).toLocaleDateString()
  }

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    const prev = post
    onChange({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    if (busy || !post.viewer) return
    const liked = !post.viewer.liked
    optimistic(
      {
        counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) },
        viewer: { ...post.viewer, liked },
      },
      () => (liked ? api.like(post.id) : api.unlike(post.id))
    )
  }

  function toggleRepost() {
    if (busy || !post.viewer) return
    const reposted = !post.viewer.reposted
    optimistic(
      {
        counts: {
          ...post.counts,
          reposts: post.counts.reposts + (reposted ? 1 : -1),
        },
        viewer: { ...post.viewer, reposted },
      },
      () => (reposted ? api.repost(post.id) : api.unrepost(post.id))
    )
  }

  function toggleBookmark() {
    if (busy || !post.viewer) return
    const bookmarked = !post.viewer.bookmarked
    optimistic(
      {
        counts: {
          ...post.counts,
          bookmarks: post.counts.bookmarks + (bookmarked ? 1 : -1),
        },
        viewer: { ...post.viewer, bookmarked },
      },
      () => (bookmarked ? api.bookmark(post.id) : api.unbookmark(post.id))
    )
  }

  return (
    <article className="relative px-4 py-3">
      {showLineBelow && (
        <div
          className="absolute top-[42px] bottom-0 left-[26px] w-px bg-border"
          aria-hidden="true"
        />
      )}

      <div className="flex gap-2.5">
        <div className="shrink-0">
          {authorHandle ? (
            <Link to="/$handle" params={{ handle: authorHandle }}>
              <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
            </Link>
          ) : (
            <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs">
            {authorHandle ? (
              <Link
                to="/$handle"
                params={{ handle: authorHandle }}
                className="font-semibold hover:underline"
              >
                {post.author.displayName || `@${authorHandle}`}
              </Link>
            ) : (
              <span className="font-semibold">
                {post.author.displayName ?? "unknown"}
              </span>
            )}
            {authorHandle && (
              <span className="text-muted-foreground">@{authorHandle}</span>
            )}
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tabular-nums">
              {relativeTime(post.createdAt)}
            </span>
          </div>

          <p className="mt-1 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap">
            <RichText text={post.text} />
          </p>

          {post.media && post.media.length > 0 && (
            <div
              className={`mt-2 grid gap-px overflow-hidden rounded-sm border border-border ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
            >
              {post.media.map((m) => {
                const variant =
                  m.variants.find((v) => v.kind === "medium") ?? m.variants[0]
                return (
                  <div key={m.id} className="aspect-video bg-muted">
                    {m.processingState === "ready" && (
                      <img
                        src={variant.url}
                        alt={m.altText ?? ""}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-5 text-muted-foreground">
            {authorHandle && (
              <Link
                to="/$handle/p/$id"
                params={{ handle: authorHandle, id: post.id }}
                className="flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums hover:text-foreground"
              >
                <IconMessageCircle size={16} stroke={1.5} />
                <span>{post.counts.replies}</span>
              </Link>
            )}
            <button
              type="button"
              onClick={toggleRepost}
              disabled={busy || !post.viewer}
              className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-emerald-500 ${post.viewer?.reposted ? "text-emerald-500" : ""}`}
            >
              <IconRepeat size={16} stroke={1.5} />
              <span>{post.counts.reposts}</span>
            </button>
            <button
              type="button"
              onClick={toggleLike}
              disabled={busy || !post.viewer}
              className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-rose-500 ${post.viewer?.liked ? "text-rose-500" : ""}`}
            >
              {post.viewer?.liked ? (
                <IconHeartFilled size={16} />
              ) : (
                <IconHeart size={16} stroke={1.5} />
              )}
              <span>{post.counts.likes}</span>
            </button>
            <button
              type="button"
              onClick={toggleBookmark}
              disabled={busy || !post.viewer}
              className={`flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground ${post.viewer?.bookmarked ? "text-sky-600" : ""}`}
            >
              {post.viewer?.bookmarked ? (
                <IconBookmarkFilled size={16} />
              ) : (
                <IconBookmark size={16} stroke={1.5} />
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function ParentPost({
  post,
  onChange,
  hasAncestors,
}: {
  post: Post
  onChange: (p: Post) => void
  hasAncestors?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const authorHandle = post.author.handle
  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    const prev = post
    onChange({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    if (busy || !post.viewer) return
    const liked = !post.viewer.liked
    optimistic(
      {
        counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) },
        viewer: { ...post.viewer, liked },
      },
      () => (liked ? api.like(post.id) : api.unlike(post.id))
    )
  }

  function toggleRepost() {
    if (busy || !post.viewer) return
    const reposted = !post.viewer.reposted
    optimistic(
      {
        counts: {
          ...post.counts,
          reposts: post.counts.reposts + (reposted ? 1 : -1),
        },
        viewer: { ...post.viewer, reposted },
      },
      () => (reposted ? api.repost(post.id) : api.unrepost(post.id))
    )
  }

  function toggleBookmark() {
    if (busy || !post.viewer) return
    const bookmarked = !post.viewer.bookmarked
    optimistic(
      {
        counts: {
          ...post.counts,
          bookmarks: post.counts.bookmarks + (bookmarked ? 1 : -1),
        },
        viewer: { ...post.viewer, bookmarked },
      },
      () => (bookmarked ? api.bookmark(post.id) : api.unbookmark(post.id))
    )
  }

  return (
    <article className="relative border-b border-border px-4 py-3.5">
      {hasAncestors && (
        <div
          className="absolute top-0 left-[26px] h-3.5 w-px bg-border"
          aria-hidden="true"
        />
      )}

      <div className="flex items-center gap-2">
        {authorHandle ? (
          <Link to="/$handle" params={{ handle: authorHandle }}>
            <Avatar initial={initial} src={post.author.avatarUrl} size={26} />
          </Link>
        ) : (
          <Avatar initial={initial} src={post.author.avatarUrl} size={26} />
        )}
        <div className="min-w-0 flex-1">
          {authorHandle ? (
            <Link
              to="/$handle"
              params={{ handle: authorHandle }}
              className="block hover:underline"
            >
              <span className="text-[13px] font-semibold">
                {post.author.displayName || `@${authorHandle}`}
              </span>
            </Link>
          ) : (
            <span className="text-[13px] font-semibold">
              {post.author.displayName ?? "unknown"}
            </span>
          )}
          {authorHandle && (
            <span className="block text-[11px] text-muted-foreground">
              @{authorHandle}
            </span>
          )}
        </div>
        <IconDots size={14} className="shrink-0 text-muted-foreground" />
      </div>

      <p className="mt-2.5 text-[15.5px] leading-[1.5] break-words whitespace-pre-wrap">
        <RichText text={post.text} />
      </p>

      {post.media && post.media.length > 0 && (
        <div
          className={`mt-2.5 grid gap-px overflow-hidden rounded-sm border border-border ${post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {post.media.map((m) => {
            const variant =
              m.variants.find((v) => v.kind === "medium") ?? m.variants[0]
            return (
              <div key={m.id} className="aspect-video bg-muted">
                {m.processingState === "ready" && (
                  <img
                    src={variant.url}
                    alt={m.altText ?? ""}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
        {post.counts.reposts > 0 && <span>{post.counts.reposts} reposts</span>}
        {post.counts.likes > 0 && <span>{post.counts.likes} likes</span>}
        {post.counts.bookmarks > 0 && (
          <span>{post.counts.bookmarks} bookmarks</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-5 text-muted-foreground">
        <button
          type="button"
          className="flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums hover:text-foreground"
        >
          <IconMessageCircle size={16} stroke={1.5} />
          <span>{post.counts.replies}</span>
        </button>
        <button
          type="button"
          onClick={toggleRepost}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-emerald-500 ${post.viewer?.reposted ? "text-emerald-500" : ""}`}
        >
          <IconRepeat size={16} stroke={1.5} />
          <span>{post.counts.reposts}</span>
        </button>
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-rose-500 ${post.viewer?.liked ? "text-rose-500" : ""}`}
        >
          {post.viewer?.liked ? (
            <IconHeartFilled size={16} />
          ) : (
            <IconHeart size={16} stroke={1.5} />
          )}
          <span>{post.counts.likes}</span>
        </button>
        <button
          type="button"
          onClick={toggleBookmark}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground ${post.viewer?.bookmarked ? "text-sky-600" : ""}`}
        >
          {post.viewer?.bookmarked ? (
            <IconBookmarkFilled size={16} />
          ) : (
            <IconBookmark size={16} stroke={1.5} />
          )}
        </button>
      </div>
    </article>
  )
}

function ReplyComposer({
  postId,
  onReply,
}: {
  postId: string
  onReply: (p: Post) => void
}) {
  const { me } = useMe()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const avatarInitial = (me?.displayName ?? me?.handle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  const canSubmit = text.trim().length > 0 && !loading

  async function submit() {
    if (!canSubmit) return
    setLoading(true)
    try {
      const { post } = await api.createPost({
        text: text.trim(),
        replyToId: postId,
      })
      setText("")
      setExpanded(false)
      onReply(post)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useSubmitHotkey(submit, { enabled: canSubmit, target: textareaRef })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-border px-4 py-2.5"
    >
      <div className="flex gap-2.5">
        <Avatar initial={avatarInitial} src={me?.avatarUrl} size={20} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (textareaRef.current) {
                textareaRef.current.style.height = "auto"
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
              }
            }}
            onFocus={() => setExpanded(true)}
            placeholder="Post your reply"
            rows={1}
            className="w-full resize-none bg-transparent text-[13px] leading-relaxed placeholder:text-muted-foreground focus:outline-none"
          />

          <div
            className={`flex items-center justify-between overflow-hidden transition-all duration-200 ${
              expanded ? "mt-2.5 max-h-10 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="add image"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconPhoto size={13} stroke={1.5} />
              </button>
              <button
                type="button"
                aria-label="add poll"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconChartBar size={13} stroke={1.5} />
              </button>
              <button
                type="button"
                aria-label="add hashtag"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconHash size={13} stroke={1.5} />
              </button>
              <button
                type="button"
                aria-label="mention someone"
                className="flex size-[22px] items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconAt size={13} stroke={1.5} />
              </button>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-[22px] rounded-sm bg-foreground px-2.5 text-[11.5px] font-bold text-background transition-opacity disabled:opacity-50"
            >
              {loading ? "Replying…" : "Reply"}
            </button>
          </div>

          {!expanded && (
            <div className="mt-1 flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-[22px] rounded-sm bg-foreground px-2.5 text-[11.5px] font-bold text-background transition-opacity disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  )
}

function ReplyCard({
  post,
  onChange,
}: {
  post: Post
  onChange: (p: Post) => void
}) {
  const [busy, setBusy] = useState(false)
  const authorHandle = post.author.handle
  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    const prev = post
    onChange({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      onChange(prev)
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    if (busy || !post.viewer) return
    const liked = !post.viewer.liked
    optimistic(
      {
        counts: { ...post.counts, likes: post.counts.likes + (liked ? 1 : -1) },
        viewer: { ...post.viewer, liked },
      },
      () => (liked ? api.like(post.id) : api.unlike(post.id))
    )
  }

  function toggleRepost() {
    if (busy || !post.viewer) return
    const reposted = !post.viewer.reposted
    optimistic(
      {
        counts: {
          ...post.counts,
          reposts: post.counts.reposts + (reposted ? 1 : -1),
        },
        viewer: { ...post.viewer, reposted },
      },
      () => (reposted ? api.repost(post.id) : api.unrepost(post.id))
    )
  }

  function relativeTime(iso: string): string {
    const d = new Date(iso).getTime()
    const diff = Date.now() - d
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const dd = Math.floor(h / 24)
    if (dd < 7) return `${dd}d`
    return new Date(iso).toLocaleDateString()
  }

  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        {authorHandle ? (
          <Link
            to="/$handle"
            params={{ handle: authorHandle }}
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
          </Link>
        ) : (
          <Avatar initial={initial} src={post.author.avatarUrl} size={20} />
        )}
        {authorHandle ? (
          <Link
            to="/$handle"
            params={{ handle: authorHandle }}
            className="font-semibold hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {post.author.displayName || `@${authorHandle}`}
          </Link>
        ) : (
          <span className="font-semibold">
            {post.author.displayName ?? "unknown"}
          </span>
        )}
        {authorHandle && (
          <span className="text-muted-foreground">@{authorHandle}</span>
        )}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground tabular-nums">
          {relativeTime(post.createdAt)}
        </span>
        <div className="flex-1" />
        <IconDots size={13} className="text-muted-foreground" />
      </div>

      <p className="mt-1.5 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap">
        <RichText text={post.text} />
      </p>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: action bar wrapper */}
      <div
        className="mt-2.5 flex items-center gap-5 text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums hover:text-foreground"
        >
          <IconMessageCircle size={16} stroke={1.5} />
          <span>{post.counts.replies}</span>
        </button>
        <button
          type="button"
          onClick={toggleRepost}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-emerald-500 ${post.viewer?.reposted ? "text-emerald-500" : ""}`}
        >
          <IconRepeat size={16} stroke={1.5} />
          <span>{post.counts.reposts}</span>
        </button>
        <button
          type="button"
          onClick={toggleLike}
          disabled={busy || !post.viewer}
          className={`flex items-center gap-1.5 py-0.5 text-[13px] tabular-nums transition-colors hover:text-rose-500 ${post.viewer?.liked ? "text-rose-500" : ""}`}
        >
          {post.viewer?.liked ? (
            <IconHeartFilled size={16} />
          ) : (
            <IconHeart size={16} stroke={1.5} />
          )}
          <span>{post.counts.likes}</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 py-0.5 transition-colors hover:text-foreground"
        >
          <IconBookmark size={16} stroke={1.5} />
        </button>
      </div>
    </>
  )
}
