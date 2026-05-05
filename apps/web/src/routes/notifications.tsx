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
import { ProfileHoverCard } from "../components/profile-hover-card"
import { VerifiedBadge } from "../components/verified-badge"
import { RichText } from "../components/rich-text"
import { PostEngagementBar } from "../components/post-engagement-bar"
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
    <div
      className="flex items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      {items.slice(0, 8).map((item) => {
        const initial = (item.actor?.displayName ?? item.actor?.handle ?? "·")
          .slice(0, 1)
          .toUpperCase()
        const handle = item.actor?.handle
        const avatar = (
          <Avatar initial={initial} src={item.actor?.avatarUrl} size="md" />
        )
        if (handle) {
          return (
            <Link
              key={item.id}
              to="/$handle"
              params={{ handle }}
              className="rounded-full transition hover:opacity-80"
              aria-label={`View @${handle}`}
            >
              {avatar}
            </Link>
          )
        }
        return <span key={item.id}>{avatar}</span>
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
  const navigate = useNavigate()
  const lead = items[0]
  const leadDisplayName = lead.actor?.displayName ?? null
  const leadHandle = lead.actor?.handle ?? null
  const isUnread = items.some((n) => !n.readAt)

  const canOpenPost = Boolean(target.author.handle && target.id)

  function openPost(e: React.MouseEvent | React.KeyboardEvent) {
    if ("target" in e && (e.target as HTMLElement).closest("a, button")) return
    if (!target.author.handle || !target.id) return
    navigate({
      to: "/$handle/p/$id",
      params: { handle: target.author.handle, id: target.id },
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
      role={canOpenPost ? "button" : undefined}
      tabIndex={canOpenPost ? 0 : undefined}
      onClick={canOpenPost ? openPost : undefined}
      onKeyDown={canOpenPost ? handleKeyDown : undefined}
      className={`focus-visible:ring-primary block border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${canOpenPost ? "cursor-pointer" : ""} ${isUnread ? "bg-subtle" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center">
          <HeartIcon className="size-5.5 text-like" />
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
              onClick={(e) => e.stopPropagation()}
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
            liked your post
          </span>
        </p>
        {target.text && (
          <p className="mt-1 line-clamp-1 text-sm text-tertiary">
            {target.text}
          </p>
        )}
      </div>
    </div>
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
  const actor = item.actor
  const actorDisplayName = actor?.displayName ?? null
  const actorHandle = actor?.handle ?? null
  const actorInitial = (actor?.displayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()
  const replyTarget = item.target

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

  const avatarEl = (
    <Avatar
      initial={actorInitial}
      src={actor?.avatarUrl}
      className="size-10 shrink-0"
    />
  )

  return (
    <div
      className={`border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 ${!item.readAt ? "bg-subtle" : ""}`}
    >
      <div className="flex items-start gap-3">
        {actorHandle ? (
          <ProfileHoverCard handle={actorHandle}>
            <Link
              to="/$handle"
              params={{ handle: actorHandle }}
              className="shrink-0 rounded-full transition hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
              aria-label={`View @${actorHandle}`}
            >
              {avatarEl}
            </Link>
          </ProfileHoverCard>
        ) : (
          avatarEl
        )}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex items-center gap-1.5">
            {actorHandle ? (
              <ProfileHoverCard handle={actorHandle}>
                <Link
                  to="/$handle"
                  params={{ handle: actorHandle }}
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {actorDisplayName || actorHandle}
                  {actor?.isVerified && (
                    <VerifiedBadge size={14} role={actor.role} />
                  )}
                </Link>
              </ProfileHoverCard>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                {actorDisplayName || "someone"}
                {actor?.isVerified && (
                  <VerifiedBadge size={14} role={actor.role} />
                )}
              </span>
            )}
            {actorHandle && <span className="text-tertiary">@{actorHandle}</span>}
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
                  <Link
                    to="/$handle"
                    params={{ handle }}
                    className="text-sky-500 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{handle}
                  </Link>
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
          {replyTarget && <PostEngagementBar post={replyTarget} />}
        </div>
      </div>
    </div>
  )
}

function MentionRow({ item }: { item: NotificationItem }) {
  const actor = item.actor
  const actorDisplayName = actor?.displayName ?? null
  const actorHandle = actor?.handle ?? null
  const actorInitial = (actorDisplayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()
  const mentionTarget = item.target

  const avatarEl = (
    <Avatar
      initial={actorInitial}
      src={actor?.avatarUrl}
      className="size-10 shrink-0"
    />
  )

  return (
    <div
      className={`border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 ${!item.readAt ? "bg-subtle" : ""}`}
    >
      <div className="flex items-start gap-3">
        {actorHandle ? (
          <ProfileHoverCard handle={actorHandle}>
            <Link
              to="/$handle"
              params={{ handle: actorHandle }}
              className="shrink-0 rounded-full transition hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
              aria-label={`View @${actorHandle}`}
            >
              {avatarEl}
            </Link>
          </ProfileHoverCard>
        ) : (
          avatarEl
        )}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex items-center gap-1.5">
            {actorHandle ? (
              <ProfileHoverCard handle={actorHandle}>
                <Link
                  to="/$handle"
                  params={{ handle: actorHandle }}
                  className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {actorDisplayName || actorHandle}
                  {actor?.isVerified && (
                    <VerifiedBadge size={14} role={actor.role} />
                  )}
                </Link>
              </ProfileHoverCard>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                {actorDisplayName || "someone"}
                {actor?.isVerified && (
                  <VerifiedBadge size={14} role={actor.role} />
                )}
              </span>
            )}
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
          {mentionTarget && <PostEngagementBar post={mentionTarget} />}
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
  const navigate = useNavigate()
  const Icon = iconForKind(item.kind)
  const iconClass = iconClassForKind(item.kind)
  const verb = verbForKind(item.kind)
  const actorDisplayName = item.actor?.displayName ?? null
  const actorHandle = item.actor?.handle ?? null
  const actorInitial = (actorDisplayName ?? actorHandle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  const targetHandle = item.target?.author.handle ?? null
  const targetId = item.target?.id ?? null

  const canOpen =
    (item.kind === "follow" && Boolean(actorHandle)) ||
    Boolean(targetHandle && targetId)

  function openRow(e: React.MouseEvent | React.KeyboardEvent) {
    if ("target" in e && (e.target as HTMLElement).closest("a, button")) return
    if (item.kind === "follow") {
      if (!actorHandle) return
      navigate({ to: "/$handle", params: { handle: actorHandle } })
      return
    }
    if (!targetHandle || !targetId) return
    navigate({
      to: "/$handle/p/$id",
      params: { handle: targetHandle, id: targetId },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openRow(e)
    }
  }

  const avatarEl = (
    <Avatar
      initial={actorInitial}
      src={item.actor?.avatarUrl}
      className="size-10 shrink-0"
    />
  )

  return (
    <div
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? openRow : undefined}
      onKeyDown={canOpen ? handleKeyDown : undefined}
      className={`focus-visible:ring-primary block border-b border-neutral px-4 py-3.5 transition-colors hover:bg-base-2/20 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${canOpen ? "cursor-pointer" : ""} ${!item.readAt ? "bg-subtle" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center">
          <Icon className={`size-5.5 ${iconClass}`} />
        </div>
        {actorHandle ? (
          <ProfileHoverCard handle={actorHandle}>
            <Link
              to="/$handle"
              params={{ handle: actorHandle }}
              className="shrink-0 rounded-full transition hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
              aria-label={`View @${actorHandle}`}
            >
              {avatarEl}
            </Link>
          </ProfileHoverCard>
        ) : (
          avatarEl
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p>
            {actorHandle ? (
              <ProfileHoverCard handle={actorHandle}>
                <Link
                  to="/$handle"
                  params={{ handle: actorHandle }}
                  className="inline-flex items-center gap-1 align-middle font-semibold text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {actorDisplayName || actorHandle}
                  {item.actor?.isVerified && (
                    <VerifiedBadge size={14} role={item.actor.role} />
                  )}
                </Link>
              </ProfileHoverCard>
            ) : (
              <span className="inline-flex items-center gap-1 align-middle font-semibold text-primary">
                {actorDisplayName || "someone"}
                {item.actor?.isVerified && (
                  <VerifiedBadge size={14} role={item.actor.role} />
                )}
              </span>
            )}
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
        </div>
      </div>
    </div>
  )
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
