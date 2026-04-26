import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { NotePencilIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton, SkeletonAvatar } from "@workspace/ui/components/skeleton"
import { api } from "../lib/api"
import { usePageHeader } from "../components/app-page-header"
import { Avatar } from "../components/avatar"
import { PageEmpty, PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import {
  UnderlineTabButton,
  UnderlineTabRow,
} from "../components/underline-tab-row"
import { VerifiedBadge } from "../components/verified-badge"
import { subscribeToDmStream } from "../lib/dm-stream"
import type { DmConversation, DmMember } from "../lib/api"

export const Route = createFileRoute("/inbox/")({ component: InboxList })

type Folder = "inbox" | "requests"

function InboxList() {
  const [folder, setFolder] = useState<Folder>("inbox")
  const [requestCount, setRequestCount] = useState(0)

  const appHeader = useMemo(
    () => ({
      title: "Messages" as const,
      action: (
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link to="/inbox/new" />}
        >
          <NotePencilIcon size={14} />
          New
        </Button>
      ),
    }),
    []
  )
  usePageHeader(appHeader)

  return (
    <PageFrame>
      <main>
        <UnderlineTabRow>
          <UnderlineTabButton
            active={folder === "inbox"}
            onClick={() => setFolder("inbox")}
          >
            Inbox
          </UnderlineTabButton>
          <UnderlineTabButton
            active={folder === "requests"}
            onClick={() => setFolder("requests")}
          >
            <span className="inline-flex items-center justify-center gap-2">
              Requests
              {requestCount > 0 ? (
                <Badge variant="secondary" className="tabular-nums">
                  {requestCount}
                </Badge>
              ) : null}
            </span>
          </UnderlineTabButton>
        </UnderlineTabRow>

        <ConversationList
          key={folder}
          folder={folder}
          onRequestCount={setRequestCount}
        />
      </main>
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
  const [conversations, setConversations] =
    useState<Array<DmConversation> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    async function load() {
      try {
        const res = await api.dmConversations(folder)
        if (cancel) return
        setConversations(res.conversations)
        onRequestCount(res.requestCount)
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "failed to load")
      }
    }
    load()
    const unsubscribe = subscribeToDmStream(() => load())
    const iv = setInterval(load, 120_000)
    return () => {
      cancel = true
      clearInterval(iv)
      unsubscribe()
    }
  }, [folder, onRequestCount])

  if (error) return <PageError message={error} />
  if (!conversations) {
    return (
      <ul>
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="flex items-start gap-3 border-b border-border px-4 py-3"
          >
            <SkeletonAvatar />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          </li>
        ))}
      </ul>
    )
  }
  if (conversations.length === 0) {
    return (
      <PageEmpty
        title={
          folder === "requests" ? "No message requests" : "No conversations yet"
        }
        description={
          folder === "requests"
            ? "When someone you don't follow messages you, it'll appear here."
            : "Use New above, or open a profile and use the message action."
        }
      />
    )
  }
  return (
    <ul>
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
    ? new Date(conversation.lastMessageAt).toLocaleString()
    : ""
  const peer =
    !isGroup && !conversation.title ? conversation.members.at(0) : null

  return (
    <li>
      <Link
        to="/inbox/$conversationId"
        params={{ conversationId: conversation.id }}
        className="flex items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/20"
      >
        <ConversationAvatar conversation={conversation} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 text-sm font-semibold">
              <span className="truncate">{title}</span>
              {peer?.isVerified && <VerifiedBadge size={14} role={peer.role} />}
            </span>
            <time className="shrink-0 text-xs text-muted-foreground">{ts}</time>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {isGroup && `${conversation.members.length + 1} members · `}
            {preview ?? "No messages yet."}
          </p>
        </div>
        {conversation.unreadCount > 0 && (
          <span className="ml-2 self-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
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
    // Stack the first two member avatars in a 2x2-ish overlap so groups read at a glance.
    const a = conversation.members.at(0)
    const b = conversation.members.at(1)
    return (
      <div className="relative size-10 shrink-0">
        {a && (
          <Avatar
            initial={initialFor(a)}
            src={a.avatarUrl}
            className="absolute top-0 left-0 size-7 ring-2 ring-background"
          />
        )}
        {b && (
          <Avatar
            initial={initialFor(b)}
            src={b.avatarUrl}
            className="absolute right-0 bottom-0 size-7 ring-2 ring-background"
          />
        )}
      </div>
    )
  }
  const other = conversation.members.at(0)
  return (
    <Avatar
      initial={other ? initialFor(other) : "?"}
      src={other?.avatarUrl ?? null}
      className="size-10"
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

type MessageKind = "text" | "media" | "post_share" | "article_share" | "system"

function previewForKind(kind: MessageKind | undefined) {
  if (kind === "media") return "[media]"
  if (kind === "post_share") return "[shared post]"
  if (kind === "article_share") return "[shared article]"
  if (kind === "system") return "[system]"
  return null
}
