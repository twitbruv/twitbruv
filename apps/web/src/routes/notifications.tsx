import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowPathIcon,
  AtSymbolIcon,
  BellIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleOvalLeftIcon,
  HeartIcon,
  UserPlusIcon,
} from "@heroicons/react/24/solid"
import {
  ArrowPathIcon as ArrowPathOutline,
  BookmarkIcon as BookmarkIconOutline,
  ChatBubbleOvalLeftIcon as ChatBubbleOutline,
  HeartIcon as HeartOutline,
} from "@heroicons/react/24/outline"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Avatar } from "@workspace/ui/components/avatar"
import { api } from "../lib/api"
import { qk } from "../lib/query-keys"
import { authClient } from "../lib/auth"
import { usePageHeader } from "../components/app-page-header"
import { useCompose } from "../components/compose-provider"
import { PageEmpty } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import { RichText } from "../components/rich-text"
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

type NotificationsQueryKey = ReturnType<typeof qk.notifications.list>

const ESTIMATED_NOTIFICATION_HEIGHT = 140

const GROUPING_THRESHOLD = 3

type GroupedNotification =
  | { type: "single"; item: NotificationItem }
  | { type: "grouped-likes"; items: Array<NotificationItem>; target: Post }
  | { type: "grouped-follows"; items: Array<NotificationItem> }
  | { type: "reply"; item: NotificationItem }
  | { type: "mention"; item: NotificationItem }

function groupNotifications(
  items: Array<NotificationItem>
): Array<GroupedNotification> {
  const likesByEntity = new Map<string, Array<NotificationItem>>()
  const follows: Array<NotificationItem> = []
  const others: Array<{ index: number; entry: GroupedNotification }> = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === "like" && item.entityId) {
      const key = item.entityId
      if (!likesByEntity.has(key)) likesByEntity.set(key, [])
      likesByEntity.get(key)!.push(item)
    } else if (item.kind === "follow") {
      follows.push(item)
    } else if (item.kind === "reply" || item.kind === "article_reply") {
      others.push({ index: i, entry: { type: "reply", item } })
    } else if (item.kind === "mention") {
      others.push({ index: i, entry: { type: "mention", item } })
    } else {
      others.push({ index: i, entry: { type: "single", item } })
    }
  }

  const result: Array<{ index: number; entry: GroupedNotification }> = [
    ...others,
  ]

  for (const [, likeItems] of likesByEntity) {
    const firstIndex = items.indexOf(likeItems[0])
    if (likeItems.length >= GROUPING_THRESHOLD && likeItems[0].target) {
      result.push({
        index: firstIndex,
        entry: {
          type: "grouped-likes",
          items: likeItems,
          target: likeItems[0].target,
        },
      })
    } else {
      for (const item of likeItems) {
        result.push({
          index: items.indexOf(item),
          entry: { type: "single", item },
        })
      }
    }
  }

  if (follows.length >= GROUPING_THRESHOLD) {
    const firstIndex = items.indexOf(follows[0])
    result.push({
      index: firstIndex,
      entry: { type: "grouped-follows", items: follows },
    })
  } else {
    for (const item of follows) {
      result.push({
        index: items.indexOf(item),
        entry: { type: "single", item },
      })
    }
  }

  result.sort((a, b) => a.index - b.index)
  return result.map((r) => r.entry)
}

function groupId(group: GroupedNotification): string {
  switch (group.type) {
    case "single":
    case "reply":
    case "mention":
      return group.item.id
    case "grouped-likes":
      return `likes-${group.items[0].entityId}`
    case "grouped-follows":
      return `follows-${group.items[0].id}`
  }
}

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
  const { open: openCompose } = useCompose()

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
    queryKey: qk.notifications.list(),
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!session,
  })

  useEffect(() => {
    if (!session) return
    api
      .notificationsMarkRead({ all: true })
      .then(() => {
        queryClient.setQueryData(qk.notifications.unread(), { count: 0 })
        queryClient.invalidateQueries({ queryKey: qk.notifications.unread() })
      })
      .catch(() => {})
  }, [session, queryClient])

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.notifications) ?? [],
    [data]
  )

  const markAllRead = useCallback(async () => {
    await api.notificationsMarkRead({ all: true })
    queryClient.setQueryData(qk.notifications.unread(), { count: 0 })
    const now = new Date().toISOString()
    queryClient.setQueryData<
      InfiniteData<NotificationsPage, string | undefined>
    >(qk.notifications.list(), (current) => {
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
          variant="transparent"
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
      {isPending ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-3 border-b border-neutral px-4 py-3"
            >
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-destructive p-4 text-sm">{error.message}</p>
      ) : items.length === 0 ? (
        <PageEmpty
          icon={<BellIcon />}
          title="All caught up"
          description="New likes, replies, mentions, follows, and reposts will land here. Post or follow people to get the conversation going."
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => openCompose()}>
                Write a post
              </Button>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link to="/search" />}
              >
                Find people
              </Button>
            </>
          }
        />
      ) : (
        <NotificationsList
          items={items}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      )}
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
  const [scrollEl, setScrollEl] = useState<HTMLElement | null | undefined>(
    undefined
  )

  const grouped = useMemo(() => groupNotifications(props.items), [props.items])

  useIsoLayoutEffect(() => {
    setScrollEl(findScrollParent(probeRef.current))
  }, [])

  if (scrollEl === undefined) {
    return (
      <div ref={probeRef}>
        {grouped.map((group) => (
          <GroupedNotificationRow key={groupId(group)} group={group} />
        ))}
        {props.hasNextPage && (
          <div className="flex justify-center py-4 text-xs text-tertiary">
            {props.isFetchingNextPage ? "loading…" : ""}
          </div>
        )}
      </div>
    )
  }

  if (scrollEl === null) {
    return <WindowNotificationsList {...props} grouped={grouped} />
  }
  return (
    <ContainerNotificationsList
      {...props}
      grouped={grouped}
      scrollEl={scrollEl}
    />
  )
}

function WindowNotificationsList({
  grouped,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: NotificationsListProps & { grouped: Array<GroupedNotification> }) {
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
    count: grouped.length,
    estimateSize: () => ESTIMATED_NOTIFICATION_HEIGHT,
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => groupId(grouped[i]),
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
          const group = grouped[vi.index]
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
              <GroupedNotificationRow group={group} />
            </div>
          )
        })}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4 text-xs text-tertiary">
          {isFetchingNextPage ? "loading…" : ""}
        </div>
      )}
    </div>
  )
}

function ContainerNotificationsList({
  grouped,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  scrollEl,
}: NotificationsListProps & {
  grouped: Array<GroupedNotification>
  scrollEl: HTMLElement
}) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: grouped.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_NOTIFICATION_HEIGHT,
    overscan: 6,
    getItemKey: (i) => groupId(grouped[i]),
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
      <div style={{ height: totalSize, position: "relative", width: "100%" }}>
        {virtualItems.map((vi) => {
          const group = grouped[vi.index]
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
              <GroupedNotificationRow group={group} />
            </div>
          )
        })}
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {hasNextPage && (
        <div className="flex justify-center py-4 text-xs text-tertiary">
          {isFetchingNextPage ? "loading…" : ""}
        </div>
      )}
    </div>
  )
}

function GroupedNotificationRow({ group }: { group: GroupedNotification }) {
  switch (group.type) {
    case "grouped-likes":
      return <GroupedLikeRow items={group.items} target={group.target} />
    case "grouped-follows":
      return <GroupedFollowRow items={group.items} />
    case "reply":
      return <ReplyRow item={group.item} />
    case "mention":
      return <MentionRow item={group.item} />
    case "single":
      return <NotificationRow item={group.item} />
  }
}

function AvatarRow({ items }: { items: Array<NotificationItem> }) {
  return (
    <div className="flex items-center gap-1.5">
      {items.slice(0, 8).map((item) => {
        const initial = (item.actor?.displayName ?? item.actor?.handle ?? "·")
          .slice(0, 1)
          .toUpperCase()
        return (
          <Avatar
            key={item.id}
            initial={initial}
            src={item.actor?.avatarUrl}
            size="md"
          />
        )
      })}
    </div>
  )
}

function GroupedLikeRow({
  items,
  target,
}: {
  items: Array<NotificationItem>
  target: Post
}) {
  const lead = items[0]
  const leadDisplayName = lead.actor?.displayName ?? null
  const leadHandle = lead.actor?.handle ?? null
  const isUnread = items.some((n) => !n.readAt)

  const postLink =
    target.author.handle && target.id
      ? `/${target.author.handle}/p/${target.id}`
      : null

  return (
    <Link
      to={postLink ?? "#"}
      className={`block border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 ${isUnread ? "bg-subtle" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center">
          <HeartIcon className="size-5.5 text-like" />
        </div>
        <AvatarRow items={items} />
      </div>
      <div className="mt-2 pl-[52px]">
        <p className="text-sm">
          <span className="font-semibold text-primary">
            {leadDisplayName || leadHandle || "someone"}
          </span>
          {leadHandle && <span className="text-tertiary"> @{leadHandle}</span>}
          <span className="text-secondary">
            {" "}
            and {items.length - 1} other{items.length - 1 !== 1 ? "s" : ""}{" "}
            liked your post
          </span>
        </p>
        {target.text && (
          <p className="mt-1 line-clamp-1 text-sm text-tertiary">
            {target.text}
          </p>
        )}
      </div>
    </Link>
  )
}

function GroupedFollowRow({ items }: { items: Array<NotificationItem> }) {
  const lead = items[0]
  const leadDisplayName = lead.actor?.displayName ?? null
  const leadHandle = lead.actor?.handle ?? null
  const isUnread = items.some((n) => !n.readAt)

  return (
    <div
      className={`border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 ${isUnread ? "bg-subtle" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center">
          <UserPlusIcon className="size-5.5 text-sky-500" />
        </div>
        <AvatarRow items={items} />
      </div>
      <div className="mt-2 pl-[52px]">
        <p className="text-sm">
          {leadHandle ? (
            <Link
              to="/$handle"
              params={{ handle: leadHandle }}
              className="font-semibold text-primary hover:underline"
            >
              {leadDisplayName || leadHandle}
            </Link>
          ) : (
            <span className="font-semibold text-primary">
              {leadDisplayName || "someone"}
            </span>
          )}
          {leadHandle && <span className="text-tertiary"> @{leadHandle}</span>}
          <span className="text-secondary">
            {" "}
            and {items.length - 1} other{items.length - 1 !== 1 ? "s" : ""}{" "}
            followed you
          </span>
        </p>
      </div>
    </div>
  )
}

function ReplyRow({ item }: { item: NotificationItem }) {
  const navigate = useNavigate()
  const actor = item.actor
  const actorDisplayName = actor?.displayName ?? null
  const actorHandle = actor?.handle ?? null
  const actorInitial = (actor?.displayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()
  const replyTarget = item.target

  // Use chain handles if available, otherwise fall back to single parent handle
  const chainHandles = replyTarget?.replyChainHandles ?? []
  const fallbackHandle = replyTarget?.replyToId
    ? (replyTarget.replyParent?.author.handle ?? null)
    : null
  const replyToHandles =
    chainHandles.length > 0
      ? chainHandles
      : fallbackHandle
        ? [fallbackHandle]
        : []

  function openPost(e: React.MouseEvent | React.KeyboardEvent) {
    // Don't navigate if click originated from a link (e.g., @mention in RichText)
    if ("target" in e && (e.target as HTMLElement).closest("a")) return
    if (!replyTarget?.author.handle || !replyTarget.id) return
    navigate({
      to: "/$handle/p/$id",
      params: { handle: replyTarget.author.handle, id: replyTarget.id },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openPost(e)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPost}
      onKeyDown={handleKeyDown}
      className={`focus-visible:ring-primary cursor-pointer border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${!item.readAt ? "bg-subtle" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Avatar
          initial={actorInitial}
          src={actor?.avatarUrl}
          className="size-10 shrink-0"
        />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              {actorDisplayName || actorHandle || "someone"}
              {actor?.isVerified && (
                <VerifiedBadge size={14} role={actor.role} />
              )}
            </span>
            {actorHandle && (
              <span className="text-tertiary">@{actorHandle}</span>
            )}
            <span className="text-xs text-tertiary">
              · {formatShortTime(item.createdAt)}
            </span>
          </div>
          {replyToHandles.length > 0 && (
            <p className="mt-0.5 text-secondary">
              Replying to{" "}
              {replyToHandles.slice(0, 2).map((handle, i) => (
                <span key={handle}>
                  {i > 0 && ", "}
                  <span className="text-sky-500">@{handle}</span>
                </span>
              ))}
              {replyToHandles.length > 2 && (
                <span className="text-secondary">
                  {" "}
                  and {replyToHandles.length - 2} other
                  {replyToHandles.length - 2 !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          )}
          {replyTarget?.text && (
            <p className="mt-0.5 leading-relaxed whitespace-pre-wrap text-primary">
              <RichText text={replyTarget.text} />
            </p>
          )}
          <div
            className="mt-2 flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1">
              <span className="inline-flex size-7 items-center justify-center rounded-full text-tertiary">
                <ChatBubbleOutline className="size-4" />
              </span>
            </div>
            <div className="flex-1">
              <span className="inline-flex size-7 items-center justify-center rounded-full text-tertiary">
                <ArrowPathOutline className="size-4" />
              </span>
            </div>
            <div className="flex-1">
              <span className="inline-flex items-center gap-1 rounded-full text-tertiary">
                <HeartOutline className="size-4" />
                {(replyTarget?.counts.likes ?? 0) > 0 && (
                  <span className="text-xs">{replyTarget?.counts.likes}</span>
                )}
              </span>
            </div>
            <div>
              <span className="inline-flex size-7 items-center justify-center rounded-full text-tertiary">
                <BookmarkIconOutline className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MentionRow({ item }: { item: NotificationItem }) {
  const navigate = useNavigate()
  const actor = item.actor
  const actorDisplayName = actor?.displayName ?? null
  const actorHandle = actor?.handle ?? null
  const actorInitial = (actorDisplayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()
  const mentionTarget = item.target

  function openPost(e: React.MouseEvent | React.KeyboardEvent) {
    // Don't navigate if click originated from a link (e.g., @mention in RichText)
    if ("target" in e && (e.target as HTMLElement).closest("a")) return
    if (!mentionTarget?.author.handle || !mentionTarget.id) return
    navigate({
      to: "/$handle/p/$id",
      params: { handle: mentionTarget.author.handle, id: mentionTarget.id },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openPost(e)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPost}
      onKeyDown={handleKeyDown}
      className={`focus-visible:ring-primary cursor-pointer border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${!item.readAt ? "bg-subtle" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Avatar
          initial={actorInitial}
          src={actor?.avatarUrl}
          className="size-10 shrink-0"
        />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              {actorDisplayName || actorHandle || "someone"}
              {actor?.isVerified && (
                <VerifiedBadge size={14} role={actor.role} />
              )}
            </span>
            {actorHandle && (
              <span className="text-tertiary">@{actorHandle}</span>
            )}
            <span className="text-xs text-tertiary">
              · {formatShortTime(item.createdAt)}
            </span>
          </div>
          {mentionTarget?.text && (
            <p className="mt-0.5 leading-relaxed whitespace-pre-wrap text-primary">
              <RichText text={mentionTarget.text} />
            </p>
          )}
          <div
            className="mt-2 flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1">
              <span className="inline-flex size-7 items-center justify-center rounded-full text-tertiary">
                <ChatBubbleOutline className="size-4" />
              </span>
            </div>
            <div className="flex-1">
              <span className="inline-flex size-7 items-center justify-center rounded-full text-tertiary">
                <ArrowPathOutline className="size-4" />
              </span>
            </div>
            <div className="flex-1">
              <span className="inline-flex items-center gap-1 rounded-full text-tertiary">
                <HeartOutline className="size-4" />
                {(mentionTarget?.counts.likes ?? 0) > 0 && (
                  <span className="text-xs">{mentionTarget?.counts.likes}</span>
                )}
              </span>
            </div>
            <div>
              <span className="inline-flex size-7 items-center justify-center rounded-full text-tertiary">
                <BookmarkIconOutline className="size-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatShortTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const Icon = iconForKind(item.kind)
  const iconClass = iconClassForKind(item.kind)
  const verb = verbForKind(item.kind)
  const actorDisplayName = item.actor?.displayName ?? null
  const actorHandle = item.actor?.handle ?? null
  const actorInitial = (actorDisplayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  // For follow notifications, link to the actor's profile
  // For other notifications with a target post, link to the post
  const destination =
    item.kind === "follow" && actorHandle
      ? `/${actorHandle}`
      : item.target?.author.handle && item.target.id
        ? `/${item.target.author.handle}/p/${item.target.id}`
        : null

  const containerClass = `block border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 ${!item.readAt ? "bg-subtle" : ""}`

  const content = (
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center">
        <Icon className={`size-5.5 ${iconClass}`} />
      </div>
      <Avatar
        initial={actorInitial}
        src={item.actor?.avatarUrl}
        className="size-10 shrink-0"
      />
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="inline-flex items-center gap-1 align-middle font-semibold text-primary">
            {actorDisplayName || actorHandle || "someone"}
            {item.actor?.isVerified && (
              <VerifiedBadge size={14} role={item.actor.role} />
            )}
          </span>
          {actorHandle && (
            <span className="text-tertiary"> @{actorHandle}</span>
          )}
          <span className="text-secondary"> {verb}</span>
          <span className="ml-1.5 text-xs text-tertiary">
            · {formatShortTime(item.createdAt)}
          </span>
        </p>
        {item.target?.text && (
          <p className="mt-1 line-clamp-1 text-sm text-tertiary">
            {item.target.text}
          </p>
        )}
        {item.target && item.kind !== "like" && item.target.counts.likes > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-tertiary">
            <HeartOutline className="size-3.5" />
            <span>{item.target.counts.likes}</span>
          </div>
        )}
      </div>
    </div>
  )

  if (destination) {
    return (
      <Link to={destination} className={containerClass}>
        {content}
      </Link>
    )
  }

  return <div className={containerClass}>{content}</div>
}

function iconForKind(kind: NotificationItem["kind"]) {
  switch (kind) {
    case "like":
      return HeartIcon
    case "repost":
      return ArrowPathIcon
    case "reply":
    case "article_reply":
      return ChatBubbleOvalLeftIcon
    case "quote":
      return ChatBubbleBottomCenterTextIcon
    case "follow":
      return UserPlusIcon
    case "mention":
      return AtSymbolIcon
    default:
      return HeartIcon
  }
}

function iconClassForKind(kind: NotificationItem["kind"]): string {
  switch (kind) {
    case "like":
      return "text-like"
    case "repost":
      return "text-emerald-500"
    case "follow":
      return "text-sky-500"
    case "quote":
      return "text-amber-500"
    case "mention":
    case "reply":
    case "article_reply":
    default:
      return "text-tertiary"
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
