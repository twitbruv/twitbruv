import { Link, createFileRoute } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/solid"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Avatar } from "@workspace/ui/components/avatar"
import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { api } from "../lib/api"
import { PageEmpty, PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import { subscribeToDmStream } from "../lib/dm-stream"
import { qk } from "../lib/query-keys"
import type { DmConversation, DmMember } from "../lib/api"

export const Route = createFileRoute("/inbox/")({ component: InboxList })

type Folder = "inbox" | "requests"

function InboxList() {
  const [folder, setFolder] = useState<Folder>("inbox")
  const [requestCount, setRequestCount] = useState(0)

  return (
    <PageFrame>
      <header className="sticky top-0 z-40 border-b border-neutral bg-base-1/90 px-4 py-3 backdrop-blur-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base leading-tight font-semibold text-primary">
              Messages
            </h1>
            <p className="mt-0.5 text-xs text-tertiary">
              Inbox and message requests
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/inbox/new" />}
          >
            <PencilSquareIcon className="size-3.5" />
            New
          </Button>
        </div>
        <div className="max-w-xs">
          <SegmentedControl<Folder>
            layout="fit"
            variant="ghost"
            value={folder}
            options={[
              { value: "inbox", label: "Inbox" },
              {
                value: "requests",
                label:
                  requestCount > 0 ? `Requests (${requestCount})` : "Requests",
              },
            ]}
            onValueChange={(value) => setFolder(value)}
          />
        </div>
      </header>

      <ConversationList
        key={folder}
        folder={folder}
        onRequestCount={setRequestCount}
      />
    </PageFrame>
  )
}

function ConversationList({
  folder,
  onRequestCount,
}: {
  folder: Folder
  onRequestCount: (count: number) => void
}) {
  const qc = useQueryClient()
  const { data, error, isPending } = useQuery({
    queryKey: qk.dms.conversations(folder),
    queryFn: () => api.dmConversations(folder),
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (data) onRequestCount(data.requestCount)
  }, [data?.requestCount, folder, onRequestCount])

  useEffect(() => {
    const unsubscribe = subscribeToDmStream(() => {
      qc.invalidateQueries({ queryKey: qk.dms.conversations(folder) })
      qc.invalidateQueries({ queryKey: qk.dms.conversationsAll() })
      qc.invalidateQueries({ queryKey: qk.dms.unread() })
    })
    return unsubscribe
  }, [folder, qc])

  const conversations = data?.conversations ?? []
  const errorMsg = error
    ? error instanceof Error
      ? error.message
      : "failed to load"
    : null

  if (errorMsg) return <PageError message={errorMsg} />
  if (isPending) {
    return (
      <ul className="divide-y divide-neutral">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3.5">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-full max-w-sm" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (conversations.length === 0) {
    return (
      <PageEmpty
        icon={
          folder === "requests" ? <EnvelopeIcon /> : <ChatBubbleLeftRightIcon />
        }
        title={
          folder === "requests" ? "No message requests" : "No conversations yet"
        }
        description={
          folder === "requests"
            ? "When someone you don't follow messages you, their request will land here for you to accept or decline."
            : "Start a thread by tapping New above, or open a profile and use the message action."
        }
        actions={
          folder === "inbox" ? (
            <Button
              size="sm"
              variant="primary"
              nativeButton={false}
              render={
                <Link to="/inbox/new" className="flex items-center gap-2" />
              }
            >
              New message
            </Button>
          ) : null
        }
      />
    )
  }
  return (
    <ul className="divide-y divide-neutral">
      {conversations.map((c) => (
        <ConversationRow key={c.id} conversation={c} />
      ))}
    </ul>
  )
}

function ConversationRow({ conversation }: { conversation: DmConversation }) {
  const isGroup = conversation.kind === "group"
  const title = conversation.title || defaultTitle(conversation)
  const preview =
    conversation.lastMessage?.text ??
    previewForKind(conversation.lastMessage?.kind)
  const ts = conversation.lastMessageAt
    ? formatConversationTime(new Date(conversation.lastMessageAt))
    : ""
  const peer =
    !isGroup && !conversation.title ? conversation.members.at(0) : null

  return (
    <li>
      <Link
        to="/inbox/$conversationId"
        params={{ conversationId: conversation.id }}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-base-2/30 focus-visible:bg-base-2/30 focus-visible:outline-none"
      >
        <ConversationAvatar conversation={conversation} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-primary">
              <span className="truncate">{title}</span>
              {peer?.isVerified && (
                <VerifiedBadge className="size-3.5" role={peer.role} />
              )}
            </span>
            {ts && (
              <time className="shrink-0 text-xs text-tertiary tabular-nums">
                {ts}
              </time>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-tertiary">
            {isGroup && `${conversation.members.length + 1} members · `}
            {preview ?? "No messages yet."}
          </p>
        </div>
        {conversation.unreadCount > 0 && (
          <span className="ml-1 self-center rounded-full bg-inverse px-2 py-0.5 text-[10px] font-semibold text-inverse tabular-nums">
            {conversation.unreadCount}
          </span>
        )}
      </Link>
    </li>
  )
}

function ConversationAvatar({
  conversation,
}: {
  conversation: DmConversation
}) {
  if (conversation.kind === "group") {
    const a = conversation.members.at(0)
    const b = conversation.members.at(1)
    return (
      <div className="relative size-11 shrink-0">
        {a && (
          <Avatar
            initial={initialFor(a)}
            src={a.avatarUrl}
            className="ring-base-1 absolute top-0 left-0 size-8 ring-2"
          />
        )}
        {b && (
          <Avatar
            initial={initialFor(b)}
            src={b.avatarUrl}
            className="ring-base-1 absolute right-0 bottom-0 size-8 ring-2"
          />
        )}
        {!a && !b && <Avatar initial="G" className="size-11" />}
      </div>
    )
  }
  const other = conversation.members.at(0)
  return (
    <Avatar
      initial={other ? initialFor(other) : "?"}
      src={other?.avatarUrl ?? null}
      className="size-11"
    />
  )
}

function defaultTitle(conversation: DmConversation): string {
  if (conversation.kind === "group") {
    const names = conversation.members
      .map((m) => m.displayName ?? (m.handle ? `@${m.handle}` : null))
      .filter((n): n is string => Boolean(n))
    if (names.length === 0) return "Group"
    if (names.length <= 3) return names.join(", ")
    return `${names.slice(0, 2).join(", ")} + ${names.length - 2}`
  }
  const other = conversation.members.at(0)
  return (
    other?.displayName ?? (other?.handle ? `@${other.handle}` : "Conversation")
  )
}

function initialFor(m: DmMember): string {
  return (m.displayName || m.handle || "?").slice(0, 1).toUpperCase()
}

function formatConversationTime(date: Date): string {
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

type MessageKind = "text" | "media" | "post_share" | "article_share" | "system"

function previewForKind(kind: MessageKind | undefined) {
  if (kind === "media") return "[media]"
  if (kind === "post_share") return "[shared post]"
  if (kind === "article_share") return "[shared article]"
  if (kind === "system") return "[system]"
  return null
}
