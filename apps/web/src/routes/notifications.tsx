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
import {  api } from "../lib/api"
import { authClient } from "../lib/auth"
import { VerifiedBadge } from "../components/verified-badge"
import type {NotificationItem} from "../lib/api";

export const Route = createFileRoute("/notifications")({ component: Notifications })

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
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    )
  }
  const hasUnread = items.some((n) => !n.readAt)

  return (
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
              <SkeletonAvatar className="size-8" />
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
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "loading…" : "load more"}
              </Button>
            </li>
          )}
        </ul>
      )}
    </main>
  )
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const Icon = iconForKind(item.kind)
  const actorLabel = item.actor
    ? item.actor.displayName || (item.actor.handle ? `@${item.actor.handle}` : "someone")
    : "someone"
  const actorPath = item.actor?.handle ? item.actor.handle : null
  const verb = verbForKind(item.kind)

  return (
    <li
      className={`flex items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/20 ${
        !item.readAt ? "bg-primary/5" : ""
      }`}
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/80">
        <Icon size={18} stroke={1.75} />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p>
          {actorPath ? (
            <Link
              to="/$handle"
              params={{ handle: actorPath }}
              className="inline-flex items-center gap-1 font-semibold align-middle hover:underline"
            >
              {actorLabel}
              {item.actor?.isVerified && <VerifiedBadge size={14} />}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold align-middle">
              {actorLabel}
              {item.actor?.isVerified && <VerifiedBadge size={14} />}
            </span>
          )}{" "}
          <span className="text-muted-foreground">{verb}</span>
        </p>
        <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
          {new Date(item.createdAt).toLocaleString()}
        </time>
      </div>
    </li>
  )
}

function iconForKind(kind: NotificationItem["kind"]) {
  switch (kind) {
    case "like":
      return IconHeart
    case "repost":
      return IconRepeat
    case "reply":
    case "article_reply":
    case "dm":
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
    case "dm":
      return "sent you a message"
  }
}
