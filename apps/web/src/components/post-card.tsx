import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  BookmarkIcon,
  ChatCircleIcon,
  HeartIcon,
  PushPinIcon,
  QuotesIcon,
  RepeatIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { POST_MAX_LEN } from "@workspace/validators"
import { recordImpression } from "../lib/analytics"
import { ApiError, api } from "../lib/api"
import { RichText } from "./rich-text"
import { MacfolioCardFromText } from "./macfolio-card"
import { GithubCardBlock } from "./github-card"
import { Avatar } from "./avatar"
import { ImageLightbox } from "./image-lightbox"
import { Compose } from "./compose"
import { PollBlock } from "./poll-block"
import { PostMenu } from "./post-menu"
import { VerifiedBadge } from "./verified-badge"
import type { Post, PostEdit } from "../lib/api"

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

function pickVariant(media: NonNullable<Post["media"]>[number]) {
  return (
    media.variants.find((v) => v.kind === "medium") ??
    media.variants.find((v) => v.kind === "large") ??
    media.variants.find((v) => v.kind === "thumb") ??
    media.variants[0]
  )
}

function pickLargest(media: NonNullable<Post["media"]>[number]) {
  return (
    media.variants.find((v) => v.kind === "large") ??
    media.variants.find((v) => v.kind === "medium") ??
    media.variants.find((v) => v.kind === "thumb") ??
    media.variants[0]
  )
}

function clickedInteractiveElement(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, summary, [role="button"], [role="menuitem"], [data-slot^="dropdown-menu"], [data-post-card-ignore-open]'
      )
    )
  )
}

export function ArticleCardBlock({
  card,
}: {
  card: NonNullable<Post["articleCard"]>
}) {
  if (!card.authorHandle) {
    return (
      <div className="mt-2 rounded-md border border-border p-3 text-sm">
        <h3 className="font-semibold">{card.title}</h3>
        {card.subtitle && (
          <p className="mt-1 text-muted-foreground">{card.subtitle}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          article · {card.readingMinutes} min read
        </p>
      </div>
    )
  }
  return (
    <Link
      to="/$handle/a/$slug"
      params={{ handle: card.authorHandle, slug: card.slug }}
      className="mt-2 block rounded-md border border-border p-3 text-sm transition hover:bg-muted/40"
    >
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Article
      </div>
      <h3 className="mt-1 text-base leading-snug font-semibold">
        {card.title}
      </h3>
      {card.subtitle && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {card.subtitle}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {card.readingMinutes} min read
        {card.publishedAt
          ? ` · ${new Date(card.publishedAt).toLocaleDateString()}`
          : ""}
      </p>
    </Link>
  )
}

export function QuoteEmbed({ post }: { post: Post }) {
  const handle = post.author.handle
  const thumb = post.media?.find((m) => m.processingState === "ready")
  const variant =
    thumb?.variants.find((v) => v.kind === "thumb") ??
    thumb?.variants.find((v) => v.kind === "medium") ??
    thumb?.variants[0]
  const content = (
    <div className="mt-2 overflow-hidden rounded-md border border-border transition hover:bg-muted/40">
      <div className="flex gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 font-semibold text-foreground">
              {post.author.displayName || `@${handle ?? "unknown"}`}
              {post.author.isVerified && (
                <VerifiedBadge size={13} role={post.author.role} />
              )}
            </span>
            {handle && <span className="text-muted-foreground">@{handle}</span>}
            <span className="text-muted-foreground">·</span>
            <time className="text-muted-foreground" dateTime={post.createdAt}>
              {relativeTime(post.createdAt)}
            </time>
          </div>
          {post.text && (
            <p className="mt-1 line-clamp-4 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {post.text}
            </p>
          )}
        </div>
        {variant && (
          <div className="size-20 shrink-0 overflow-hidden rounded">
            <img
              src={variant.url}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    </div>
  )
  if (handle) {
    return (
      <Link
        to="/$handle/p/$id"
        params={{ handle, id: post.id }}
        className="block"
      >
        {content}
      </Link>
    )
  }
  return content
}

function MediaGrid({ media }: { media: NonNullable<Post["media"]> }) {
  const cols = media.length === 1 ? "grid-cols-1" : "grid-cols-2"
  const gallery = media.flatMap((m) => {
    if (m.processingState !== "ready") return []
    const full = pickLargest(m)
    return [{ id: m.id, src: full.url, alt: m.altText ?? "" }]
  })
  return (
    <div className={`mt-2 grid gap-1 overflow-hidden rounded-md ${cols}`}>
      {media.map((m) => {
        const thumb = pickVariant(m)
        const aspect =
          m.width && m.height ? `${m.width} / ${m.height}` : undefined
        const isReady = m.processingState === "ready" && thumb
        const galleryIndex = gallery.findIndex((g) => g.id === m.id)
        return (
          <ImageLightbox
            key={m.id}
            images={gallery.map(({ src, alt }) => ({ src, alt }))}
            initialIndex={galleryIndex >= 0 ? galleryIndex : 0}
            disabled={!isReady || gallery.length === 0}
            className="block h-full w-full"
          >
            <div
              className="h-full w-full overflow-hidden bg-muted"
              style={aspect ? { aspectRatio: aspect } : undefined}
            >
              {isReady ? (
                <img
                  src={thumb.url}
                  alt={m.altText ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  {m.processingState === "failed"
                    ? "media failed"
                    : "processing…"}
                </div>
              )}
            </div>
          </ImageLightbox>
        )
      })}
    </div>
  )
}

export function PostCard({
  post: outerPost,
  onChange,
  onRemove,
  canHide = false,
}: {
  post: Post
  onChange?: (post: Post) => void
  onRemove?: (id: string) => void
  /** When true (set by the thread page when the viewer authored the conversation
   *  root, or by admin tooling for moderators), expose Hide/Unhide reply menu items. */
  canHide?: boolean
}) {
  const navigate = useNavigate()
  const isRepost = Boolean(outerPost.repostOf)
  const post = outerPost.repostOf ?? outerPost

  const articleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const el = articleRef.current
    if (!el) return
    let visibleSince: number | null = null
    let fired = false
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.5) {
            if (visibleSince === null) visibleSince = Date.now()
            if (!fired && Date.now() - visibleSince >= 1000) {
              recordImpression({
                kind: "impression",
                subjectType: "post",
                subjectId: post.id,
              })
              fired = true
              observer.disconnect()
            }
          } else {
            visibleSince = null
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    )
    observer.observe(el)
    // Observers do not fire on time alone; interval completes the 1s dwell.
    const iv = window.setInterval(() => {
      if (fired || visibleSince === null) return
      if (Date.now() - visibleSince >= 1000) {
        recordImpression({
          kind: "impression",
          subjectType: "post",
          subjectId: post.id,
        })
        fired = true
        observer.disconnect()
        window.clearInterval(iv)
      }
    }, 250)
    return () => {
      observer.disconnect()
      window.clearInterval(iv)
    }
  }, [post.id])
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(post.text)
  const [editError, setEditError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const authorHandle = post.author.handle
  const showProfileLink = Boolean(authorHandle)
  const showPostLink = Boolean(authorHandle)

  function emit(next: Post) {
    if (!onChange) return
    if (isRepost) onChange({ ...outerPost, repostOf: next })
    else onChange(next)
  }

  async function saveEdit() {
    if (busy) return
    if (editText.trim().length === 0 || editText.length > POST_MAX_LEN) {
      setEditError("invalid length")
      return
    }
    if (editText === post.text) {
      setEditing(false)
      return
    }
    setBusy(true)
    setEditError(null)
    try {
      const { post: updated } = await api.editPost(post.id, editText)
      emit(updated)
      setEditing(false)
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "edit failed")
    } finally {
      setBusy(false)
    }
  }

  async function optimistic(next: Partial<Post>, op: () => Promise<unknown>) {
    if (!onChange) {
      try {
        await op()
      } catch {}
      return
    }
    const prev = post
    emit({ ...post, ...next })
    setBusy(true)
    try {
      await op()
    } catch {
      emit(prev)
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

  const initial = (post.author.displayName ?? authorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  function openPostPage() {
    if (!authorHandle) return
    navigate({
      to: "/$handle/p/$id",
      params: { handle: authorHandle, id: post.id },
    })
  }

  return (
    <article
      ref={articleRef}
      className="border-b border-border px-4 py-4 transition-colors hover:bg-muted/20"
    >
      {outerPost.pinned && (
        <div className="mb-2 ml-10 flex items-center gap-1.5 text-xs text-muted-foreground">
          <PushPinIcon size={14} weight="fill" />
          <span>Pinned</span>
        </div>
      )}
      {isRepost && outerPost.author.handle && (
        <Link
          to="/$handle"
          params={{ handle: outerPost.author.handle }}
          className="mb-2 ml-10 flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
        >
          <RepeatIcon size={14} />
          <span className="flex items-center gap-1">
            <span>
              Reposted by{" "}
              {outerPost.author.displayName || `@${outerPost.author.handle}`}
            </span>
            {outerPost.author.isVerified && (
              <VerifiedBadge size={12} role={outerPost.author.role} />
            )}
          </span>
        </Link>
      )}
      <div className="flex gap-3">
        <div className="shrink-0">
          {authorHandle ? (
            <Link to="/$handle" params={{ handle: authorHandle }}>
              <Avatar
                initial={initial}
                src={post.author.avatarUrl}
                className="size-10 text-sm ring-1 ring-border"
              />
            </Link>
          ) : (
            <Avatar
              initial={initial}
              src={post.author.avatarUrl}
              className="size-10 text-sm ring-1 ring-border"
            />
          )}
        </div>

        <div
          className={`min-w-0 flex-1${authorHandle ? " cursor-pointer" : ""}`}
          onClick={(event) => {
            if (!authorHandle) return
            if (clickedInteractiveElement(event.target)) return
            openPostPage()
          }}
        >
          <header className="flex items-center gap-2 text-sm">
            {showProfileLink && authorHandle ? (
              <Link
                to="/$handle"
                params={{ handle: authorHandle }}
                className="flex items-center gap-1 font-semibold text-foreground hover:underline"
              >
                {post.author.displayName || `@${authorHandle}`}
                {post.author.isVerified && (
                  <VerifiedBadge size={15} role={post.author.role} />
                )}
              </Link>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-foreground">
                {post.author.displayName ?? "unknown"}
                {post.author.isVerified && (
                  <VerifiedBadge size={15} role={post.author.role} />
                )}
              </span>
            )}
            {authorHandle && (
              <span className="text-muted-foreground">@{authorHandle}</span>
            )}
            <span className="text-muted-foreground">·</span>
            {showPostLink && authorHandle ? (
              <Link
                to="/$handle/p/$id"
                params={{ handle: authorHandle, id: post.id }}
                className="text-muted-foreground hover:underline"
                title={post.createdAt}
              >
                <time dateTime={post.createdAt}>
                  {relativeTime(post.createdAt)}
                </time>
              </Link>
            ) : (
              <time className="text-muted-foreground" dateTime={post.createdAt}>
                {relativeTime(post.createdAt)}
              </time>
            )}
            {post.editedAt && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="text-xs text-muted-foreground hover:underline"
                title="View edit history"
              >
                (edited)
              </button>
            )}
            <PostMenu
              post={post}
              onChange={emit}
              onRemove={() => onRemove?.(outerPost.id)}
              canHide={canHide}
              isRepost={isRepost}
              onStartEdit={() => {
                setEditing(true)
                setEditText(post.text)
              }}
              className="ml-auto"
            />
            <EditHistoryDialog
              open={historyOpen}
              onOpenChange={setHistoryOpen}
              post={post}
            />
          </header>
          {editing ? (
            <div className="mt-1">
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="min-h-20 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
                maxLength={POST_MAX_LEN}
              />
              <div className="mt-1 flex items-center justify-between text-xs">
                <span
                  className={
                    editText.length > POST_MAX_LEN
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {POST_MAX_LEN - editText.length}
                </span>
                <div className="flex items-center gap-2">
                  {editError && (
                    <span className="text-destructive">{editError}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(false)
                      setEditText(post.text)
                      setEditError(null)
                    }}
                  >
                    cancel
                  </Button>
                  <Button size="sm" onClick={saveEdit} disabled={busy}>
                    save
                  </Button>
                </div>
              </div>
            </div>
          ) : post.articleCard ? null : (
            <p className="wrap-break-words mt-1 text-[15px] leading-relaxed whitespace-pre-wrap">
              <RichText text={post.text} />
            </p>
          )}
          {!editing && <MacfolioCardFromText text={post.text} />}
          {post.articleCard && <ArticleCardBlock card={post.articleCard} />}
          {post.githubCards?.map((card, i) => (
            <GithubCardBlock key={`${card.kind}-${card.url}-${i}`} card={card} />
          ))}
          {post.media && post.media.length > 0 && (
            <MediaGrid media={post.media} />
          )}
          {post.poll && (
            <PollBlock
              poll={post.poll}
              onChange={(nextPoll) => emit({ ...post, poll: nextPoll })}
            />
          )}
          {post.quoteOf && <QuoteEmbed post={post.quoteOf} />}
          <footer
            className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            {showPostLink && authorHandle && (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                disabled={busy || !post.viewer}
                className="flex items-center gap-2 transition hover:text-foreground"
                aria-pressed={post.viewer?.reposted}
                render={
                  <Link
                    to="/$handle/p/$id"
                    params={{ handle: authorHandle, id: post.id }}
                    className="flex items-center gap-2 hover:text-foreground"
                  >
                    <ChatCircleIcon className="size-4" />
                    <span className="text-xs">{post.counts.replies}</span>
                  </Link>
                }
              />
            )}
            <RepostControl
              post={post}
              busy={busy}
              onToggleRepost={toggleRepost}
              onQuoteCreated={(_: Post) => {
                if (post.viewer) {
                  emit({
                    ...post,
                    counts: { ...post.counts, quotes: post.counts.quotes + 1 },
                  })
                }
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLike}
              disabled={busy || !post.viewer}
              className={`flex cursor-pointer items-center gap-2 transition hover:text-foreground ${post.viewer?.liked ? "text-foreground" : ""}`}
              aria-pressed={post.viewer?.liked}
            >
              {post.viewer?.liked ? (
                <HeartIcon className="size-4" weight="fill" />
              ) : (
                <HeartIcon className="size-4" />
              )}
              <span className="text-xs">{post.counts.likes}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleBookmark}
              disabled={busy || !post.viewer}
              className={`flex cursor-pointer items-center gap-2 transition hover:text-foreground ${post.viewer?.bookmarked ? "text-foreground" : ""}`}
              aria-pressed={post.viewer?.bookmarked}
            >
              {post.viewer?.bookmarked ? (
                <BookmarkIcon className="size-4" weight="fill" />
              ) : (
                <BookmarkIcon className="size-4" />
              )}
              <span className="text-xs">{post.counts.bookmarks}</span>
            </Button>
          </footer>
        </div>
      </div>
    </article>
  )
}

function RepostControl({
  post,
  busy,
  onToggleRepost,
  onQuoteCreated,
}: {
  post: Post
  busy: boolean
  onToggleRepost: () => void
  onQuoteCreated: (quote: Post) => void
}) {
  const [quoteOpen, setQuoteOpen] = useState(false)
  const reposted = Boolean(post.viewer?.reposted)
  const disabled = busy || !post.viewer

  if (reposted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleRepost}
        disabled={disabled}
        className="flex cursor-pointer items-center gap-2 text-foreground transition hover:text-foreground"
        aria-pressed
      >
        <RepeatIcon className="size-4" />
        <span className="text-xs">
          {post.counts.reposts + post.counts.quotes}
        </span>
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="flex cursor-pointer items-center gap-2 transition hover:text-foreground"
            >
              <RepeatIcon className="size-4" />
              <span className="text-xs">
                {post.counts.reposts + post.counts.quotes}
              </span>
            </Button>
          }
        />
        <DropdownMenuContent align="start" sideOffset={4} className="w-40">
          <DropdownMenuItem onClick={onToggleRepost}>
            <RepeatIcon className="size-3.5" />
            <span>Repost</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setQuoteOpen(true)}>
            <QuotesIcon className="size-3.5" />
            <span>Quote post</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-sm font-semibold">
              Quote post
            </DialogTitle>
            <DialogDescription className="sr-only">
              Write your commentary. The original post will be attached.
            </DialogDescription>
          </DialogHeader>
          <Compose
            quoteOfId={post.id}
            quoted={post}
            onCreated={(created) => {
              onQuoteCreated(created)
              setQuoteOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function EditHistoryDialog({
  open,
  onOpenChange,
  post,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  post: Post
}) {
  const [edits, setEdits] = useState<Array<PostEdit> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setEdits(null)
    api
      .postEdits(post.id)
      .then(({ edits: rows }) => setEdits(rows))
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "couldn't load history")
      )
  }, [open, post.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Edit history
          </DialogTitle>
          <DialogDescription className="sr-only">
            Previous versions of this post, newest first.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pt-2">
          <div className="rounded-md border border-border p-3">
            <div className="mb-1 text-xs text-muted-foreground">
              Current version
              {post.editedAt
                ? ` · edited ${new Date(post.editedAt).toLocaleString()}`
                : ""}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {post.text}
            </p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!error && edits === null && (
            <p className="text-xs text-muted-foreground">loading…</p>
          )}
          {edits && edits.length === 0 && (
            <p className="text-xs text-muted-foreground">No prior versions.</p>
          )}
          {edits?.map((edit) => (
            <div key={edit.id} className="rounded-md border border-border p-3">
              <div className="mb-1 text-xs text-muted-foreground">
                Replaced at {new Date(edit.editedAt).toLocaleString()}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {edit.previousText}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
