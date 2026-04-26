import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import {
  useVirtualizer,
  useWindowVirtualizer,
} from "@tanstack/react-virtual"
import {
  AtIcon,
  HeartIcon,
  ChatCircleIcon,
  QuotesIcon,
  RepeatIcon,
  UserPlusIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Skeleton, SkeletonAvatar } from "@workspace/ui/components/skeleton"
import { api } from "../lib/api"
import { authClient } from "../lib/auth"
import { Avatar } from "../components/avatar"
import { usePageHeader } from "../components/app-page-header"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import { useInfiniteScrollSentinel } from "../lib/use-infinite-scroll-sentinel"
import type { InfiniteData } from "@tanstack/react-query"
import type { NotificationItem, Post } from "../lib/api"

export const Route = createFileRoute("/notifications")({
  component: Notifications,
})

interface NotificationsPage {
  notifications: Array<NotificationItem>
  nextCursor: string | null
}

const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const
type NotificationsQueryKey = typeof NOTIFICATIONS_QUERY_KEY

const ESTIMATED_NOTIFICATION_HEIGHT = 140

// Walk up the DOM to find the nearest ancestor that scrolls. Returns null when
// the page itself scrolls (the common case on mobile and on routes that don't
// pin the column).
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    const overflowY = style.overflowY || style.overflow
    if (/(auto|scroll|overlay)/.test(overflowY)) {
      if (node === document.documentElement || node === document.body) {
        return null
      }
      return node
    }
    node = node.parentElement
  }
  return null
}

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

function Notifications() {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!sessionPending && !session) router.navigate({ to: "/login" })
  }, [sessionPending, session, router])

  const {
    data,
    error,
    isPending,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
  } = useInfiniteQuery<
    NotificationsPage,
    Error,
    InfiniteData<NotificationsPage, string | undefined>,
    NotificationsQueryKey,
    string | undefined
  >({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!session,
  })

  // Mark everything as read on arrival. Fire-and-forget.
  useEffect(() => {
    if (!session) return
    api.notificationsMarkRead({ all: true }).catch(() => {})
  }, [session])

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.notifications) ?? [],
    [data]
  )

  const markAllRead = useCallback(async () => {
    await api.notificationsMarkRead({ all: true })
    const now = new Date().toISOString()
    queryClient.setQueryData<
      InfiniteData<NotificationsPage, string | undefined>
    >(NOTIFICATIONS_QUERY_KEY, (current) => {
      if (!current) return current
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          notifications: page.notifications.map((n) =>
            n.readAt ? n : { ...n, readAt: now }
          ),
        })),
      }
    })
  }, [queryClient])

  const hasUnread = items.some((n) => !n.readAt)

  const appHeader = useMemo(
    () => ({
      title: "Notifications" as const,
      action: (
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasUnread}
          onClick={markAllRead}
        >
          Mark all read
        </Button>
      ),
    }),
    [hasUnread, markAllRead]
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main>
        {isPending ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-border px-4 py-3"
              >
                <SkeletonAvatar className="size-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">{error.message}</p>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-semibold">All caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New likes, replies, mentions, and follows will show up here.
            </p>
          </div>
        ) : (
          <NotificationsList
            items={items}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
        )}
      </main>
    </PageFrame>
  )
}

interface NotificationsListProps {
  items: Array<NotificationItem>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

function NotificationsList(props: NotificationsListProps) {
  const probeRef = useRef<HTMLDivElement>(null)
  // null = window scroll, HTMLElement = contained scroll, undefined = unresolved
  const [scrollEl, setScrollEl] = useState<HTMLElement | null | undefined>(
    undefined
  )

  useIsoLayoutEffect(() => {
    setScrollEl(findScrollParent(probeRef.current))
  }, [])

  // First paint (and SSR): render non-virtualized so the page isn't blank
  // while the scroll container is being detected.
  if (scrollEl === undefined) {
    return (
      <div ref={probeRef}>
        {props.items.map((item) => (
          <NotificationRow key={item.id} item={item} />
        ))}
        {props.hasNextPage && (
          <div className="flex justify-center py-4 text-xs text-muted-foreground">
            {props.isFetchingNextPage ? "loading…" : ""}
          </div>
        )}
      </div>
    )
  }

  if (scrollEl === null) {
    return <WindowNotificationsList {...props} />
  }
  return <ContainerNotificationsList {...props} scrollEl={scrollEl} />
}

function WindowNotificationsList({
  items,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: NotificationsListProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useIsoLayoutEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setScrollMargin(rect.top + window.scrollY)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATED_NOTIFICATION_HEIGHT,
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => items[i].id,
  })

  useInfiniteScrollSentinel(
    sentinelRef,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    { root: null }
  )

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div>
      <div
        ref={wrapperRef}
        style={{
          height: Math.max(0, totalSize - scrollMargin),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((vi) => {
          const item = items[vi.index]
          return (
            <div
              key={vi.key}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start - scrollMargin}px)`,
              }}
            >
              <NotificationRow item={item} />
            </div>
          )
        })}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4 text-xs text-muted-foreground">
          {isFetchingNextPage ? "loading…" : ""}
        </div>
      )}
    </div>
  )
}

function ContainerNotificationsList({
  items,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  scrollEl,
}: NotificationsListProps & { scrollEl: HTMLElement }) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_NOTIFICATION_HEIGHT,
    overscan: 6,
    getItemKey: (i) => items[i].id,
  })

  useInfiniteScrollSentinel(
    sentinelRef,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    { root: scrollEl }
  )

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div>
      <div
        style={{ height: totalSize, position: "relative", width: "100%" }}
      >
        {virtualItems.map((vi) => {
          const item = items[vi.index]
          return (
            <div
              key={vi.key}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <NotificationRow item={item} />
            </div>
          )
        })}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4 text-xs text-muted-foreground">
          {isFetchingNextPage ? "loading…" : ""}
        </div>
      )}
    </div>
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
    <div
      className={`border-b border-border px-4 py-3 transition-colors hover:bg-muted/20 ${
        !item.readAt ? "bg-primary/5" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          <Icon size={18} />
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
    </div>
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
      return HeartIcon
    case "repost":
      return RepeatIcon
    case "reply":
    case "article_reply":
      return ChatCircleIcon
    case "quote":
      return QuotesIcon
    case "follow":
      return UserPlusIcon
    case "mention":
      return AtIcon
    default:
      return HeartIcon
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
