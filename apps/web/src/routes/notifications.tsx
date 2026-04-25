import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import {
  IconAt,
  IconHeart,
  IconMessageCircle,
  IconQuote,
  IconRepeat,
  IconUserPlus,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Skeleton, SkeletonAvatar } from "@workspace/ui/components/skeleton"
import { api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Avatar } from "../components/avatar"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import type { NotificationItem, Post } from "../lib/api"

export const Route = createFileRoute("/notifications")({
  component: Notifications,
})

function Notifications() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const [items, setItems] = useState<Array<NotificationItem>>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && !session) router.navigate({ to: "/login" })
  }, [isPending, session, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const page = await api.notifications()
      setItems(page.notifications)
      setCursor(page.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    load()
  }, [session, load])

  // Mark everything visible as read on arrival. Fire-and-forget.
  useEffect(() => {
    if (!session) return
    api.notificationsMarkRead({ all: true }).catch(() => {})
  }, [session])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.notifications(cursor)
      setItems((prev) => [...prev, ...page.notifications])
      setCursor(page.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  async function markAllRead() {
    await api.notificationsMarkRead({ all: true })
    setItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() }
      )
    )
  }
  const hasUnread = items.some((n) => !n.readAt)

  return (
    <PageFrame>
      <main>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
          <h1 className="text-base font-semibold">Notifications</h1>
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasUnread}
            onClick={markAllRead}
          >
            Mark all read
          </Button>
        </header>
        {loading ? (
          <ul>
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="flex items-start gap-3 border-b border-border px-4 py-3"
              >
                <SkeletonAvatar className="size-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-semibold">All caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New likes, replies, mentions, and follows will show up here.
            </p>
          </div>
        ) : (
          <ul>
            {items.map((n) => (
              <NotificationRow key={n.id} item={n} />
            ))}
            {cursor && (
              <li className="flex justify-center py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "loading…" : "load more"}
                </Button>
              </li>
            )}
          </ul>
        )}
      </main>
    </PageFrame>
  )
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const Icon = iconForKind(item.kind)
  const iconClass = iconClassForKind(item.kind)
  const verb = verbForKind(item.kind)
  const actorLabel = item.actor
    ? item.actor.displayName ||
      (item.actor.handle ? `@${item.actor.handle}` : "someone")
    : "someone"
  const actorHandle = item.actor?.handle ?? null
  const actorInitial = (item.actor?.displayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  return (
    <li
      className={`border-b border-border px-4 py-3 transition-colors hover:bg-muted/20 ${
        !item.readAt ? "bg-primary/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          <Icon size={18} stroke={1.75} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {actorHandle ? (
            <Link
              to="/$handle"
              params={{ handle: actorHandle }}
              className="inline-block"
            >
              <Avatar
                initial={actorInitial}
                src={item.actor?.avatarUrl}
                className="size-8 ring-1 ring-border"
              />
            </Link>
          ) : (
            <Avatar
              initial={actorInitial}
              src={item.actor?.avatarUrl}
              className="size-8 ring-1 ring-border"
            />
          )}
          <p className="mt-2">
            {actorHandle ? (
              <Link
                to="/$handle"
                params={{ handle: actorHandle }}
                className="inline-flex items-center gap-1 align-middle font-semibold hover:underline"
              >
                {actorLabel}
                {item.actor?.isVerified && (
                  <VerifiedBadge size={14} role={item.actor.role} />
                )}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 align-middle font-semibold">
                {actorLabel}
                {item.actor?.isVerified && (
                  <VerifiedBadge size={14} role={item.actor.role} />
                )}
              </span>
            )}{" "}
            <span className="text-muted-foreground">{verb}</span>
          </p>
          {item.target && <TargetCard post={item.target} />}
          <time
            className="mt-1 block text-xs text-muted-foreground"
            dateTime={item.createdAt}
          >
            {new Date(item.createdAt).toLocaleString()}
          </time>
        </div>
      </div>
    </li>
  )
}

/**
 * Compact preview of the post a notification refers to. For likes/reposts the post is the
 * recipient's own; for replies/mentions/quotes it's the actor's new post. We render the body
 * (or quoted body), an optional media thumbnail, and link the whole card to the post page.
 */
function TargetCard({ post }: { post: Post }) {
  const handle = post.author.handle
  const thumb = post.media?.find((m) => m.processingState === "ready")
  const variant =
    thumb?.variants.find((v) => v.kind === "thumb") ??
    thumb?.variants.find((v) => v.kind === "medium") ??
    thumb?.variants[0]

  const body = (
    <div className="mt-2 overflow-hidden rounded-md border border-border transition hover:bg-muted/40">
      <div className="flex gap-3 p-3">
        <div className="min-w-0 flex-1">
          {post.text ? (
            <p className="line-clamp-4 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {post.text}
            </p>
          ) : post.articleCard ? (
            <p className="line-clamp-2 text-sm">
              <span className="font-semibold">{post.articleCard.title}</span>
              {post.articleCard.subtitle && (
                <span className="text-muted-foreground">
                  {" "}
                  — {post.articleCard.subtitle}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">[media post]</p>
          )}
        </div>
        {variant && (
          <div className="size-16 shrink-0 overflow-hidden rounded">
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
        {body}
      </Link>
    )
  }
  return body
}

function iconForKind(kind: NotificationItem["kind"]) {
  switch (kind) {
    case "like":
      return IconHeart
    case "repost":
      return IconRepeat
    case "reply":
    case "article_reply":
      return IconMessageCircle
    case "quote":
      return IconQuote
    case "follow":
      return IconUserPlus
    case "mention":
      return IconAt
    default:
      return IconHeart
  }
}

function iconClassForKind(kind: NotificationItem["kind"]): string {
  switch (kind) {
    case "like":
      return "bg-rose-500/10 text-rose-600"
    case "repost":
      return "bg-emerald-500/10 text-emerald-600"
    case "follow":
      return "bg-sky-500/10 text-sky-600"
    case "quote":
      return "bg-amber-500/10 text-amber-600"
    case "mention":
    case "reply":
    case "article_reply":
    default:
      return "bg-muted text-foreground/80"
  }
}

function verbForKind(kind: NotificationItem["kind"]): string {
  switch (kind) {
    case "like":
      return "liked your post"
    case "repost":
      return "reposted your post"
    case "reply":
      return "replied to your post"
    case "quote":
      return "quoted your post"
    case "follow":
      return "followed you"
    case "mention":
      return "mentioned you in a post"
    case "article_reply":
      return "replied to your article"
  }
}
