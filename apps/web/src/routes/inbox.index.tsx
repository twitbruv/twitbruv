import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { IconPencilPlus } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Skeleton, SkeletonAvatar } from "@workspace/ui/components/skeleton"
import { api } from "../lib/api"
import { Avatar } from "../components/avatar"
import { PageFrame } from "../components/page-frame"
import { VerifiedBadge } from "../components/verified-badge"
import { subscribeToDmStream } from "../lib/dm-stream"
import type { DmConversation, DmMember } from "../lib/api"

export const Route = createFileRoute("/inbox/")({ component: InboxList })

type Folder = "inbox" | "requests"

function InboxList() {
  const [folder, setFolder] = useState<Folder>("inbox")
  const [conversations, setConversations] =
    useState<Array<DmConversation> | null>(null)
  const [requestCount, setRequestCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    async function load() {
      try {
        const res = await api.dmConversations(folder)
        if (cancel) return
        setConversations(res.conversations)
        setRequestCount(res.requestCount)
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "failed to load")
      }
    }
    load()
    // Refresh the whole list on any DM event. The list query is cheap, and this keeps the
    // unread counts + last-message previews in lock-step with the stream.
    const unsubscribe = subscribeToDmStream(() => load())
    // Slow reconcile as a fallback if the stream stalls silently.
    const iv = setInterval(load, 120_000)
    return () => {
      cancel = true
      clearInterval(iv)
      unsubscribe()
    }
  }, [folder])

  // Reset list state when the user switches tabs so the loading skeleton shows briefly
  // instead of stale content from the other folder.
  useEffect(() => {
    setConversations(null)
  }, [folder])

  return (
    <PageFrame>
      <main>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm">
          <h1 className="text-base font-semibold">Messages</h1>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/inbox/new" />}
          >
            <IconPencilPlus size={14} stroke={1.75} />
            New
          </Button>
        </header>

        <div className="flex border-b border-border text-sm">
          <FolderTab
            active={folder === "inbox"}
            onClick={() => setFolder("inbox")}
            label="Inbox"
          />
          <FolderTab
            active={folder === "requests"}
            onClick={() => setFolder("requests")}
            label="Requests"
            badge={requestCount}
          />
        </div>

        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        {!conversations && !error && (
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
        )}
        {conversations && conversations.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="text-sm font-semibold">
              {folder === "requests"
                ? "No message requests"
                : "No conversations yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {folder === "requests" ? (
                "When someone you don't follow messages you, it'll appear here."
              ) : (
                <>
                  Tap <span className="font-medium">New</span> above, or open
                  someone's profile and tap the message icon.
                </>
              )}
            </p>
          </div>
        )}
        {conversations && conversations.length > 0 && (
          <ul>
            {conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} />
            ))}
          </ul>
        )}
      </main>
    </PageFrame>
  )
}

function FolderTab({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
        active
          ? "border-b-2 border-primary font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
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
