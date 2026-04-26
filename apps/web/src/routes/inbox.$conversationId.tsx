import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DotsThreeIcon,
  PaperclipIcon,
  PencilIcon,
  GearIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { api } from "../lib/api"
import { authClient } from "../lib/auth"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { Avatar } from "../components/avatar"
import { ImageLightbox } from "../components/image-lightbox"
import { PageEmpty, PageError } from "../components/page-surface"
import { PageFrame } from "../components/page-frame"
import { RichText } from "../components/rich-text"
import { MacfolioCardFromText } from "../components/macfolio-card"
import { VerifiedBadge } from "../components/verified-badge"
import { subscribeToDmStream } from "../lib/dm-stream"
import {
  MAX_UPLOAD_BYTES,
  compressImage,
  pickVariantUrl,
  setAltText,
  uploadImage,
} from "../lib/media"
import { WEB_URL } from "../lib/env"
import { usePageHeader } from "../components/app-page-header"
import type { AppPageHeaderSpec } from "../components/app-page-header"
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
} from "react"
import type {
  DmConversationDetail,
  DmInvite,
  DmMember,
  DmMessage,
  PostMedia,
  PublicUser,
} from "../lib/api"

export const Route = createFileRoute("/inbox/$conversationId")({
  component: Thread,
})

const MAX_INPUT_BYTES = 15 * 1024 * 1024 // mirrors API/api/media intent ceiling pre-compress
const TYPING_TTL = 4000 // how long a typing indicator stays on screen after the last ping
const TYPING_DEBOUNCE = 3000 // don't ping the API more than once per N ms while typing

interface Pending {
  id: string
  file: File
  previewUrl: string
  altText: string
}

function Thread() {
  const { conversationId } = Route.useParams()
  const router = useRouter()
  const { data: session } = authClient.useSession()
  const me = session?.user.id ?? null
  const [conversation, setConversation] = useState<DmConversationDetail | null>(
    null
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [messages, setMessages] = useState<Array<DmMessage>>([])
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState<Pending | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Map of userId -> timestamp(ms) when their typing event last arrived; we render anyone with
  // an entry within the last TYPING_TTL ms.
  const [typingAt, setTypingAt] = useState<Record<string, number>>({})
  const lastTypingSentRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSeenIdRef = useRef<string | null>(null)
  const initialScrolledRef = useRef(false)

  // Initial hydrate from REST; subsequent updates come through the SSE stream. We still keep a
  // slow 30s poll as a belt-and-suspenders guard if the socket silently stalls.
  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      try {
        const { messages: fresh } = await api.dmMessages(conversationId)
        const ordered = [...fresh].reverse()
        setMessages((prev) => {
          if (prev.length === 0) return ordered
          const seen = new Set(prev.map((m) => m.id))
          const additions = ordered.filter((m) => !seen.has(m.id))
          if (additions.length === 0) return prev
          return [...prev, ...additions]
        })
      } catch (e) {
        if (!opts.silent)
          setError(e instanceof Error ? e.message : "failed to load")
      }
    },
    [conversationId]
  )

  useEffect(() => {
    setMessages([])
    setError(null)
    initialScrolledRef.current = false
    load()
    const iv = setInterval(() => load({ silent: true }), 30_000)
    return () => clearInterval(iv)
  }, [load])

  useEffect(() => {
    return subscribeToDmStream((event) => {
      if (event.conversationId !== conversationId) return
      switch (event.type) {
        case "message":
          setMessages((prev) =>
            prev.some((m) => m.id === event.message.id)
              ? prev
              : [...prev, event.message]
          )
          // Whoever just sent a message obviously isn't typing anymore.
          setTypingAt((prev) => {
            if (!prev[event.message.senderId]) return prev
            const next = { ...prev }
            delete next[event.message.senderId]
            return next
          })
          break
        case "message_edited":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.messageId
                ? { ...m, text: event.text, editedAt: event.editedAt }
                : m
            )
          )
          break
        case "message_deleted":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === event.messageId
                ? {
                    ...m,
                    deletedAt: new Date().toISOString(),
                    text: null,
                    media: null,
                  }
                : m
            )
          )
          break
        case "reaction":
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== event.messageId) return m
              const exists = m.reactions.some(
                (r) => r.userId === event.userId && r.emoji === event.emoji
              )
              if (event.op === "add" && !exists) {
                return {
                  ...m,
                  reactions: [
                    ...m.reactions,
                    { userId: event.userId, emoji: event.emoji },
                  ],
                }
              }
              if (event.op === "remove" && exists) {
                return {
                  ...m,
                  reactions: m.reactions.filter(
                    (r) =>
                      !(r.userId === event.userId && r.emoji === event.emoji)
                  ),
                }
              }
              return m
            })
          )
          break
        case "membership":
          // Member added/removed/renamed — refresh metadata so the header is current.
          api
            .dmConversation(conversationId)
            .then((r) => setConversation(r.conversation))
            .catch(() => {})
          break
        case "read":
          setConversation((prev) =>
            prev
              ? {
                  ...prev,
                  members: prev.members.map((m) =>
                    m.id === event.userId
                      ? { ...m, lastReadMessageId: event.messageId }
                      : m
                  ),
                }
              : prev
          )
          break
        case "typing":
          if (event.userId === me) break
          setTypingAt((prev) => ({ ...prev, [event.userId]: Date.now() }))
          break
      }
    })
  }, [conversationId, me])

  // Sweep stale typing indicators every second so they fade ~4s after the last ping.
  useEffect(() => {
    const iv = setInterval(() => {
      setTypingAt((prev) => {
        const cutoff = Date.now() - TYPING_TTL
        let changed = false
        const next: Record<string, number> = {}
        for (const [userId, ts] of Object.entries(prev)) {
          if (ts >= cutoff) next[userId] = ts
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // Fetch conversation metadata (kind, title, members, my role).
  useEffect(() => {
    setConversation(null)
    api
      .dmConversation(conversationId)
      .then((r) => setConversation(r.conversation))
      .catch(() => {
        /* metadata is best-effort; thread can still render without it */
      })
  }, [conversationId])

  // First load (or conversation switch): force-scroll to bottom and re-scroll after a beat so
  // async image layout doesn't leave us stranded above the latest message. After that, only
  // auto-scroll on new arrivals if the user is already near the bottom.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || messages.length === 0) return
    const stickToBottom = () => {
      el.scrollTop = el.scrollHeight
    }
    if (!initialScrolledRef.current) {
      initialScrolledRef.current = true
      stickToBottom()
      // Catch image / font layout shifts that happen after the initial paint.
      const t1 = setTimeout(stickToBottom, 50)
      const t2 = setTimeout(stickToBottom, 250)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) stickToBottom()
  }, [messages])

  // Mark-read: bump the high-water-mark whenever the latest visible message changes.
  useEffect(() => {
    if (messages.length === 0) return
    const latestId = messages[messages.length - 1].id
    if (latestId === lastSeenIdRef.current) return
    lastSeenIdRef.current = latestId
    api.dmMarkRead(conversationId, latestId).catch(() => {})
  }, [messages, conversationId])

  // Auto-grow the composer textarea as the user types — capped so a wall of text doesn't
  // swallow the message list.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  // Revoke any object URL we created when its preview goes away.
  useEffect(
    () => () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl)
    },
    [pending]
  )

  const peer = useMemo(() => {
    if (!me) return null
    const fromOther = messages.find(
      (m) => m.sender && m.senderId !== me
    )?.sender
    return fromOther ?? null
  }, [messages, me])

  const dmOther = useMemo(() => {
    if (!conversation || conversation.kind !== "dm" || !me) return null
    return conversation.members.find((m) => m.id !== me) ?? null
  }, [conversation, me])

  const whoForHeader = peer ?? dmOther

  const appHeader = useMemo((): AppPageHeaderSpec => {
    if (!conversation) {
      return {
        plainTitle: true,
        title: (
          <div className="flex w-full min-w-0 items-center gap-2">
            <Link
              to="/inbox"
              className="shrink-0 text-xs text-muted-foreground hover:underline"
            >
              ← Inbox
            </Link>
            <span className="text-sm text-muted-foreground">…</span>
          </div>
        ),
      }
    }
    return {
      plainTitle: true,
      title: (
        <ThreadAppHeaderTitle
          conversation={conversation}
          me={me}
          who={whoForHeader}
        />
      ),
      action:
        conversation.kind === "group" ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label="conversation settings"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon size={16} />
          </Button>
        ) : undefined,
    }
  }, [conversation, me, whoForHeader])

  usePageHeader(appHeader)

  // Group consecutive messages from the same sender, splitting whenever the day changes so we
  // can drop a sticky day-separator between them.
  const groups = useMemo(() => buildGroups(messages), [messages])

  function attachFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("only images can be attached")
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError(
        `image too large (max ${(MAX_INPUT_BYTES / 1024 / 1024).toFixed(0)}MB)`
      )
      return
    }
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      altText: "",
    })
    setError(null)
  }

  function clearPending() {
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) attachFile(file)
    // Reset the input so picking the same file twice still fires onChange.
    e.target.value = ""
  }

  function onDragOver(e: DragEvent) {
    if (sending || conversation?.myRequestState === "pending") return
    if (!Array.from(e.dataTransfer.types).includes("Files")) return
    e.preventDefault()
    setDragOver(true)
  }
  function onDragLeave(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragOver(false)
  }
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files.item(0)
    if (file) attachFile(file)
  }

  function onPasteMessage(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (sending || conversation?.myRequestState === "pending") return
    const files = getPastedImageFiles(e)
    if (files.length === 0) return
    e.preventDefault()
    attachFile(files[0])
  }

  function onPastePendingAlt(e: ClipboardEvent<HTMLInputElement>) {
    if (sending) return
    const files = getPastedImageFiles(e)
    if (files.length === 0) return
    e.preventDefault()
    attachFile(files[0])
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if ((!text && !pending) || sending) return
    setSending(true)
    setError(null)
    try {
      let mediaId: string | undefined
      if (pending) {
        const compressed = await compressImage(pending.file)
        if (compressed.size > MAX_UPLOAD_BYTES) {
          throw new Error(
            `image too large after compression (${(compressed.size / 1024 / 1024).toFixed(1)}MB > ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`
          )
        }
        const uploaded = await uploadImage(compressed)
        mediaId = uploaded.id
        if (pending.altText.trim().length > 0) {
          // Best-effort: don't block sending if alt-text save fails (rare).
          setAltText(uploaded.id, pending.altText).catch(() => {})
        }
      }
      const { message } = await api.dmSend(conversationId, {
        text: text || undefined,
        mediaId,
      })
      setDraft("")
      clearPending()
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message]
      )
      textareaRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send")
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function pingTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < TYPING_DEBOUNCE) return
    lastTypingSentRef.current = now
    api.dmTyping(conversationId).catch(() => {})
  }

  // Quickly resolve who the typing indicators belong to (sender details for avatar+name).
  const typingMembers = useMemo(() => {
    if (!conversation) return []
    const ids = new Set(Object.keys(typingAt))
    return conversation.members.filter((m) => ids.has(m.id) && m.id !== me)
  }, [typingAt, conversation, me])

  return (
    <PageFrame className="flex min-h-0 flex-1 flex-col">
      <main
        className="relative flex h-[calc(100vh-3.5rem)] flex-col"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 text-sm font-medium text-foreground">
            <div className="rounded-md border-2 border-dashed border-primary bg-background px-4 py-3 shadow-sm">
              Drop image to attach
            </div>
          </div>
        )}

        {conversation && conversation.kind === "group" && (
          <GroupSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            conversation={conversation}
            me={me}
            onChanged={(updated) => setConversation(updated)}
            onLeft={() => router.navigate({ to: "/inbox" })}
          />
        )}

        {conversation?.myRequestState === "pending" && (
          <RequestBanner
            conversationId={conversationId}
            onAccepted={() =>
              setConversation((prev) =>
                prev ? { ...prev, myRequestState: "accepted" } : prev
              )
            }
            onDeclined={() => router.navigate({ to: "/inbox" })}
          />
        )}

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
          {error && <PageError className="mb-3 max-w-prose" message={error} />}
          {messages.length === 0 && !error && (
            <PageEmpty
              className="py-8"
              title="No messages yet"
              description="Send a message to start the thread."
            />
          )}

          <ul className="flex flex-col gap-1">
            {groups.map((group) => (
              <GroupBlock
                key={group.key}
                group={group}
                me={me}
                members={conversation?.members}
                conversationId={conversationId}
                isAdmin={conversation?.myRole === "admin"}
              />
            ))}
          </ul>

          {typingMembers.length > 0 && (
            <div className="mt-2 flex items-center gap-2 px-2 text-xs text-muted-foreground">
              <span className="flex -space-x-1">
                {typingMembers.slice(0, 3).map((m) => (
                  <Avatar
                    key={m.id}
                    initial={(m.displayName || m.handle || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                    src={m.avatarUrl}
                    className="size-5 ring-2 ring-background"
                  />
                ))}
              </span>
              <TypingDots />
              <span>
                {typingMembers.length === 1
                  ? `${typingMembers[0]?.displayName || typingMembers[0]?.handle || "Someone"} is typing…`
                  : `${typingMembers.length} people are typing…`}
              </span>
            </div>
          )}
        </div>

        {pending && (
          <div className="flex items-start gap-3 border-t border-border px-3 pt-2">
            <div className="relative shrink-0">
              <img
                src={pending.previewUrl}
                alt="attachment preview"
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={clearPending}
                aria-label="remove attachment"
                className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-border hover:bg-muted"
              >
                <XIcon size={12} />
              </button>
            </div>
            <Input
              value={pending.altText}
              onChange={(e) =>
                setPending((prev) =>
                  prev ? { ...prev, altText: e.target.value } : prev
                )
              }
              onPaste={onPastePendingAlt}
              placeholder="Image description (alt text)"
              maxLength={1000}
              className="mt-1 h-8 flex-1 text-xs"
            />
          </div>
        )}

        {conversation?.myRequestState !== "pending" && (
          <form
            onSubmit={send}
            className="flex items-end gap-2 border-t border-border px-3 py-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="attach image"
              disabled={sending}
              onClick={() => fileInputRef.current?.click()}
            >
              <PaperclipIcon size={18} />
            </Button>
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (e.target.value.length > 0) pingTyping()
              }}
              onPaste={onPasteMessage}
              placeholder={pending ? "Add a caption" : "Message"}
              rows={1}
              disabled={sending}
              onKeyDown={onKeyDown}
              className="min-h-10 flex-1 py-2 text-sm leading-relaxed"
            />
            <Button
              type="submit"
              disabled={sending || (draft.trim().length === 0 && !pending)}
            >
              {sending ? "…" : "Send"}
            </Button>
          </form>
        )}
      </main>
    </PageFrame>
  )
}

function RequestBanner({
  conversationId,
  onAccepted,
  onDeclined,
}: {
  conversationId: string
  onAccepted: () => void
  onDeclined: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await api.dmAcceptRequest(conversationId)
      onAccepted()
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't accept")
    } finally {
      setBusy(false)
    }
  }

  async function decline() {
    if (
      !window.confirm(
        "Decline this message request? The sender won't be notified."
      )
    )
      return
    setBusy(true)
    setError(null)
    try {
      await api.dmDeclineRequest(conversationId)
      onDeclined()
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't decline")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        This is a message request. Accept to start the conversation or decline
        to remove it.
      </p>
      <div className="flex items-center gap-2">
        {error && <span className="text-destructive">{error}</span>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={decline}>
          Decline
        </Button>
        <Button size="sm" disabled={busy} onClick={accept}>
          Accept
        </Button>
      </div>
    </div>
  )
}

interface MessageGroup {
  key: string
  isMine: boolean
  sender: DmMessage["sender"]
  messages: Array<DmMessage>
  daySeparator: string | null
}

function buildGroups(messages: Array<DmMessage>): Array<MessageGroup> {
  const out: Array<MessageGroup> = []
  let lastDay: string | null = null
  for (const m of messages) {
    const day = new Date(m.createdAt).toDateString()
    const last = out.at(-1)
    if (last && last.messages[0].senderId === m.senderId && day === lastDay) {
      last.messages.push(m)
      continue
    }
    out.push({
      key: m.id,
      isMine: false, // overwritten by GroupBlock — easier than threading `me` here
      sender: m.sender,
      messages: [m],
      daySeparator: day === lastDay ? null : formatDay(new Date(m.createdAt)),
    })
    lastDay = day
  }
  return out
}

function GroupBlock({
  group,
  me,
  members,
  conversationId,
  isAdmin,
}: {
  group: MessageGroup
  me: string | null
  members: DmConversationDetail["members"] | undefined
  conversationId: string
  isAdmin: boolean
}) {
  const isMine = group.messages[0].senderId === me
  const lastMessage = group.messages[group.messages.length - 1]
  // Read receipts only matter on my own bubbles, on the last message of the chain.
  const seenBy =
    isMine && members
      ? members.filter(
          (m) => m.id !== me && m.lastReadMessageId === lastMessage.id
        )
      : []
  return (
    <>
      {group.daySeparator && (
        <li className="my-3 text-center text-[11px] tracking-wider text-muted-foreground uppercase">
          {group.daySeparator}
        </li>
      )}
      <li
        className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
      >
        {!isMine && (
          <div className="w-8 shrink-0">
            {group.sender && (
              <Avatar
                initial={(
                  group.sender.displayName ||
                  group.sender.handle ||
                  "?"
                )
                  .slice(0, 1)
                  .toUpperCase()}
                src={group.sender.avatarUrl}
              />
            )}
          </div>
        )}
        <div
          className={`flex max-w-[75%] flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}
        >
          {group.messages.map((m, i) => {
            const isFirst = i === 0
            const isLast = i === group.messages.length - 1
            return (
              <Bubble
                key={m.id}
                message={m}
                isMine={isMine}
                isFirst={isFirst}
                isLast={isLast}
                me={me}
                conversationId={conversationId}
                isAdmin={isAdmin}
              />
            )
          })}
          {seenBy.length > 0 && (
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>Seen</span>
              {seenBy.length > 1 && (
                <span className="flex -space-x-1">
                  {seenBy.slice(0, 4).map((m) => (
                    <Avatar
                      key={m.id}
                      initial={(m.displayName || m.handle || "?")
                        .slice(0, 1)
                        .toUpperCase()}
                      src={m.avatarUrl}
                      className="size-3.5 ring-1 ring-background"
                    />
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </li>
    </>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="size-1 animate-pulse rounded-full bg-current opacity-70 [animation-delay:-300ms]" />
      <span className="size-1 animate-pulse rounded-full bg-current opacity-70 [animation-delay:-150ms]" />
      <span className="size-1 animate-pulse rounded-full bg-current opacity-70" />
    </span>
  )
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"]
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000

function Bubble({
  message,
  isMine,
  isFirst,
  isLast,
  me,
  conversationId,
  isAdmin,
}: {
  message: DmMessage
  isMine: boolean
  isFirst: boolean
  isLast: boolean
  me: string | null
  conversationId: string
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.text ?? "")
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  const isDeleted = Boolean(message.deletedAt)
  const canEdit =
    isMine &&
    !isDeleted &&
    Date.now() - new Date(message.createdAt).getTime() < MESSAGE_EDIT_WINDOW_MS
  const canDelete = !isDeleted && (isMine || isAdmin)

  const corners = isMine
    ? `${isFirst ? "rounded-tr-2xl" : "rounded-tr-md"} ${isLast ? "rounded-br-2xl" : "rounded-br-md"} rounded-l-2xl`
    : `${isFirst ? "rounded-tl-2xl" : "rounded-tl-md"} ${isLast ? "rounded-bl-2xl" : "rounded-bl-md"} rounded-r-2xl`
  const bg = isDeleted
    ? "bg-muted/60 text-muted-foreground italic"
    : isMine
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-foreground"
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  // Roll up reactions: group by emoji with counts + "did I react with this".
  const reactionGroups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>()
    for (const r of message.reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false }
      cur.count += 1
      if (r.userId === me) cur.mine = true
      map.set(r.emoji, cur)
    }
    return Array.from(map.entries()).map(([emoji, data]) => ({
      emoji,
      ...data,
    }))
  }, [message.reactions, me])

  async function saveEdit() {
    const next = editText.trim()
    if (!next || next === message.text || busy) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await api.dmEditMessage(conversationId, message.id, next)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }
  async function doDelete() {
    if (!window.confirm("Delete this message?")) return
    setBusy(true)
    try {
      await api.dmDeleteMessage(conversationId, message.id)
    } finally {
      setBusy(false)
    }
  }
  async function react(emoji: string) {
    setShowPicker(false)
    try {
      await api.dmToggleReaction(conversationId, message.id, emoji)
    } catch {
      /* network blip — server is source of truth */
    }
  }

  // Controls render as flex siblings (not absolute) so the hover zone is the entire message
  // lane, not just the bubble. They stay opacity-0 until the row is hovered, so they don't
  // visually crowd the chat at rest. The picker stays open once toggled because it's
  // state-driven, not hover-driven.
  const controls = !isDeleted && !editing && (
    <div
      className={`relative flex shrink-0 items-center gap-1 self-center transition-opacity ${
        showPicker
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      }`}
    >
      <button
        type="button"
        onClick={() => setShowPicker((p) => !p)}
        aria-label="add reaction"
        className="flex size-6 items-center justify-center rounded-full bg-background text-xs ring-1 ring-border hover:bg-muted/40"
      >
        😀
      </button>
      {(canEdit || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="message options"
                className="flex size-6 items-center justify-center rounded-full bg-background ring-1 ring-border hover:bg-muted/40"
              >
                <DotsThreeIcon size={12} />
              </button>
            }
          />
          <DropdownMenuContent align={isMine ? "end" : "start"} sideOffset={4}>
            {canEdit && (
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <PencilIcon size={14} />
                <span>Edit</span>
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                variant="destructive"
                onClick={doDelete}
                disabled={busy}
              >
                <TrashIcon size={14} />
                <span>Delete</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {showPicker && (
        <div
          className={`absolute top-full z-20 mt-1 flex gap-1 rounded-full border border-border bg-background p-1 shadow-md ${
            isMine ? "right-0" : "left-0"
          }`}
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              className="rounded-full px-1 py-0.5 text-base hover:bg-muted/40"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div
      className={`group relative flex w-full items-start gap-1 ${isMine ? "justify-end" : "justify-start"}`}
    >
      {/* For my messages, controls sit to the LEFT of the bubble (away from screen edge). */}
      {isMine && controls}

      <div
        className={`flex max-w-full flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}
      >
        <div
          className={`max-w-full ${corners} ${bg} px-3 py-2 text-sm leading-relaxed`}
          title={new Date(message.createdAt).toLocaleString()}
        >
          {isDeleted ? (
            <span>deleted message</span>
          ) : editing ? (
            <div className="flex flex-col gap-1">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    saveEdit()
                  }
                  if (e.key === "Escape") setEditing(false)
                }}
                rows={2}
                ref={(node) => {
                  if (node) {
                    node.focus()
                    node.setSelectionRange(node.value.length, node.value.length)
                  }
                }}
                className="resize-none rounded bg-background/30 px-2 py-1 text-foreground focus:outline-none"
              />
              <div className="flex justify-end gap-2 text-[11px]">
                <button
                  onClick={() => setEditing(false)}
                  className="opacity-70 hover:opacity-100"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={busy}
                  className="font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.media && <MessageImage media={message.media} />}
              {message.text && (
                <p className="break-words whitespace-pre-wrap">
                  <RichText text={message.text} />
                </p>
              )}
              {message.text && <MacfolioCardFromText text={message.text} />}
              {!message.media && !message.text && (
                <em className="opacity-70">[unsupported]</em>
              )}
            </>
          )}
          {isLast && !editing && (
            <div
              className={`mt-1 text-[10px] tabular-nums opacity-60 ${isMine ? "text-right" : ""}`}
            >
              {time}
              {message.editedAt && <span className="ml-1">· edited</span>}
            </div>
          )}
        </div>

        {reactionGroups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => react(g.emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
                  g.mine
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background hover:bg-muted/40"
                }`}
              >
                <span>{g.emoji}</span>
                <span className="tabular-nums">{g.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* For other-side messages, controls sit to the RIGHT of the bubble. */}
      {!isMine && controls}
    </div>
  )
}

function MessageImage({ media }: { media: PostMedia }) {
  const url = pickVariantUrl(media, "medium")
  const full = pickVariantUrl(media, "large") ?? url
  if (!url) {
    return (
      <div className="my-1 flex h-32 w-48 items-center justify-center rounded-md bg-background/30 text-xs">
        {media.processingState === "failed" ? "media failed" : "processing…"}
      </div>
    )
  }
  return (
    <ImageLightbox
      images={full ? [{ src: full, alt: media.altText ?? "" }] : []}
      disabled={!full}
      className="block"
    >
      <img
        src={url}
        alt={media.altText ?? ""}
        loading="lazy"
        className="my-1 max-h-80 max-w-full rounded-md object-cover"
        style={
          media.width && media.height
            ? { aspectRatio: `${media.width} / ${media.height}` }
            : undefined
        }
      />
    </ImageLightbox>
  )
}

function ThreadAppHeaderTitle({
  conversation,
  me,
  who,
}: {
  conversation: DmConversationDetail
  me: string | null
  who: DmMember | null
}) {
  const back = (
    <Link
      to="/inbox"
      className="shrink-0 text-xs text-muted-foreground hover:underline"
    >
      ← Inbox
    </Link>
  )
  if (conversation.kind === "group") {
    const others = conversation.members.filter((m) => m.id !== me)
    const title =
      conversation.title ??
      others
        .slice(0, 3)
        .map((m) => m.displayName ?? (m.handle ? `@${m.handle}` : "user"))
        .join(", ")
    const n = conversation.members.length
    return (
      <div className="flex w-full min-w-0 items-center gap-2">
        {back}
        <div className="relative size-8 shrink-0">
          {others.slice(0, 2).map((m, i) => (
            <Avatar
              key={m.id}
              initial={(m.displayName || m.handle || "?")
                .slice(0, 1)
                .toUpperCase()}
              src={m.avatarUrl}
              className={`absolute size-6 ring-2 ring-background ${
                i === 0 ? "top-0 left-0" : "right-0 bottom-0"
              }`}
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden text-sm">
          <span className="min-w-0 truncate font-semibold text-foreground">
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            · {n} member{n === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    )
  }
  const p = who
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      {back}
      {p && (
        <Avatar
          initial={(p.displayName || p.handle || "?")
            .slice(0, 1)
            .toUpperCase()}
          src={p.avatarUrl}
          className="size-8 shrink-0"
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-sm">
        <span className="truncate font-semibold text-foreground">
          {p?.displayName ||
            (p?.handle ? `@${p.handle}` : "Conversation")}
        </span>
        {p?.isVerified && <VerifiedBadge size={14} role={p.role} />}
        {p?.handle && (
          <>
            <span className="shrink-0 text-muted-foreground" aria-hidden>
              ·
            </span>
            <Link
              to="/$handle"
              params={{ handle: p.handle }}
              className="shrink-0 text-xs text-muted-foreground hover:underline"
            >
              @{p.handle}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function GroupSettingsDialog({
  open,
  onOpenChange,
  conversation,
  me,
  onChanged,
  onLeft,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  conversation: DmConversationDetail
  me: string | null
  onChanged: (next: DmConversationDetail) => void
  onLeft: () => void
}) {
  const isAdmin = conversation.myRole === "admin"
  const [title, setTitle] = useState(conversation.title ?? "")
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<Array<PublicUser>>([])
  const [busy, setBusy] = useState(false)

  // Re-sync local title state if the dialog reopens against a freshly-renamed conversation.
  useEffect(() => {
    setTitle(conversation.title ?? "")
  }, [conversation.title, open])

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const { users } = await api.search(search.trim())
        setResults(
          users.filter((u) => !conversation.members.some((m) => m.id === u.id))
        )
      } catch {
        setResults([])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [search, conversation.members])

  async function refresh() {
    const { conversation: updated } = await api.dmConversation(conversation.id)
    onChanged(updated)
  }

  async function rename() {
    if (busy) return
    const next = title.trim() || null
    if (next === conversation.title) return
    setBusy(true)
    try {
      await api.dmRename(conversation.id, next)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function add(u: PublicUser) {
    if (busy) return
    setBusy(true)
    try {
      await api.dmAddMembers(conversation.id, [u.id])
      setSearch("")
      setResults([])
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string) {
    if (busy) return
    setBusy(true)
    try {
      await api.dmRemoveMember(conversation.id, userId)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (busy || !me) return
    if (!window.confirm("Leave this conversation?")) return
    setBusy(true)
    try {
      await api.dmLeave(conversation.id, me)
      onOpenChange(false)
      onLeft()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isAdmin ? (
            <div className="space-y-2">
              <Label
                htmlFor="group-name"
                className="text-xs text-muted-foreground"
              >
                Name
              </Label>
              <div className="flex gap-2">
                <Input
                  id="group-name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="(no name)"
                  className="flex-1"
                />
                <Button size="sm" disabled={busy} onClick={rename}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <span className="text-muted-foreground">Name: </span>
              <span className="font-medium">
                {conversation.title || "(no name)"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Members ({conversation.members.length})
            </Label>
            <ul className="divide-y divide-border rounded-md border border-border">
              {conversation.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <Avatar
                    initial={(m.displayName || m.handle || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                    src={m.avatarUrl}
                    className="size-7"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1 font-medium">
                      <span className="truncate">
                        {m.displayName ||
                          (m.handle ? `@${m.handle}` : m.id.slice(0, 8))}
                      </span>
                      {m.isVerified && (
                        <VerifiedBadge size={13} role={m.role} />
                      )}
                      {m.chatRole === "admin" && (
                        <span className="text-xs text-muted-foreground">
                          (admin)
                        </span>
                      )}
                      {m.id === me && (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && m.id !== me && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => remove(m.id)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label
                htmlFor="group-add-member"
                className="text-xs text-muted-foreground"
              >
                Add member
              </Label>
              <Input
                id="group-add-member"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by handle or name"
              />
              {results.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {results.slice(0, 6).map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => add(u)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-muted/30"
                      >
                        <Avatar
                          initial={(u.displayName || u.handle || "?")
                            .slice(0, 1)
                            .toUpperCase()}
                          src={u.avatarUrl}
                          className="size-7"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 font-medium">
                            <span className="truncate">
                              {u.displayName ||
                                (u.handle ? `@${u.handle}` : u.id.slice(0, 8))}
                            </span>
                            {u.isVerified && (
                              <VerifiedBadge size={13} role={u.role} />
                            )}
                          </div>
                          {u.handle && (
                            <div className="truncate text-xs text-muted-foreground">
                              @{u.handle}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isAdmin && <InviteSection conversationId={conversation.id} />}

          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={leave}
            className="w-full"
          >
            Leave conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InviteSection({ conversationId }: { conversationId: string }) {
  const [invites, setInvites] = useState<Array<DmInvite> | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { invites: next } = await api.dmInvites(conversationId)
    setInvites(next)
  }, [conversationId])

  useEffect(() => {
    refresh().catch(() => setInvites([]))
  }, [refresh])

  async function create() {
    if (busy) return
    setBusy(true)
    try {
      await api.dmCreateInvite(conversationId)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (busy) return
    setBusy(true)
    try {
      await api.dmRevokeInvite(conversationId, id)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function copy(token: string) {
    const url = `${WEB_URL}/invite/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(
        () => setCopied((prev) => (prev === token ? null : prev)),
        1500
      )
    } catch {
      /* clipboard blocked — user can long-press the link */
    }
  }

  const live = invites?.filter((i) => isLive(i)) ?? []

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Invite links ({live.length})
        </label>
        <Button size="sm" variant="outline" disabled={busy} onClick={create}>
          New link
        </Button>
      </div>
      {invites && invites.length === 0 && (
        <p className="text-xs text-muted-foreground">No invite links yet.</p>
      )}
      {live.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {live.map((invite) => {
            const url = `${WEB_URL}/invite/${invite.token}`
            return (
              <li key={invite.id} className="space-y-1 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[11px]">
                    {url}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(invite.token)}
                  >
                    {copied === invite.token ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  {invite.maxUses
                    ? `${invite.usedCount}/${invite.maxUses} uses · `
                    : `${invite.usedCount} uses · `}
                  {invite.expiresAt
                    ? `expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                    : "no expiry"}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function isLive(invite: DmInvite): boolean {
  if (invite.revokedAt) return false
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now())
    return false
  if (invite.maxUses !== null && invite.usedCount >= invite.maxUses)
    return false
  return true
}

function formatDay(d: Date): string {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}
