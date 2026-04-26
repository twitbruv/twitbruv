import { useEffect, useRef, useState } from "react"
import { MotionConfig, motion } from "motion/react"
import {
  ArrowLeftIcon,
  ChatIcon,
  ImageIcon,
  NotePencilIcon,
  PaperPlaneTiltIcon,
  XIcon,
} from "@phosphor-icons/react"
import { Link } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { api } from "../lib/api"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { subscribeToDmStream } from "../lib/dm-stream"
import { uploadImage } from "../lib/media"
import { useMe } from "../lib/me"
import { Avatar } from "./avatar"
import type { DmConversation, DmMember, DmMessage } from "../lib/api"

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [conversations, setConversations] =
    useState<Array<DmConversation> | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeConversation, setActiveConversation] =
    useState<DmConversation | null>(null)

  useEffect(() => {
    let cancel = false

    async function loadConversations() {
      try {
        const { conversations: next } = await api.dmConversations()
        if (!cancel) setConversations(next)
      } catch {
        // ignore
      }
    }

    async function loadUnread() {
      try {
        const { count } = await api.dmUnreadCount()
        if (!cancel) setUnreadCount(count)
      } catch {
        // ignore
      }
    }

    loadConversations()
    loadUnread()

    const unsubscribe = subscribeToDmStream(() => {
      loadConversations()
      loadUnread()
    })

    const iv = setInterval(() => {
      loadConversations()
      loadUnread()
    }, 120_000)

    return () => {
      cancel = true
      clearInterval(iv)
      unsubscribe()
    }
  }, [])

  function handleClose() {
    // Phase 1: fade out content
    setClosing(true)
    // Phase 2: after content fades, morph container to FAB
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
      setActiveConversation(null)
    }, 150)
  }

  function handleBack() {
    setActiveConversation(null)
  }

  const isExpanded = open || closing

  return (
    <MotionConfig reducedMotion="user">
    <div className="fixed right-4 bottom-4 z-50">
      <motion.div
        onClick={!open && !closing ? () => setOpen(true) : undefined}
        initial={false}
        animate={
          isExpanded
            ? { scale: 1, opacity: 1, height: activeConversation ? 512 : 380 }
            : { scale: 0, opacity: 0, height: 380 }
        }
        style={{
          originX: 1,
          originY: 1,
        }}
        transition={{
          type: "tween",
          duration: 0.35,
          ease: [0.32, 0, 0, 1],
          height: { duration: 0.25, ease: [0.32, 0, 0, 1] },
          scale: { duration: 0.38, ease: [0.32, 0, 0, 1] },
        }}
        className={`absolute right-0 bottom-0 w-80 overflow-hidden rounded-2xl border border-border bg-background shadow-xl ${isExpanded ? "" : "pointer-events-none"}`}
      >
        {activeConversation ? (
          <ChatView
            conversation={activeConversation}
            onBack={handleBack}
            onClose={handleClose}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            onSelect={setActiveConversation}
            onClose={handleClose}
          />
        )}
      </motion.div>

      {/* FAB button - always present, fades when panel is open */}
      <motion.div
        onClick={() => setOpen(true)}
        initial={false}
        animate={{ opacity: isExpanded ? 0 : 1 }}
        transition={{ duration: 0.2, delay: isExpanded ? 0 : 0.15 }}
        className={`flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 ${isExpanded ? "pointer-events-none" : ""} `}
      >
        <ChatIcon className="size-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </motion.div>
    </div>
    </MotionConfig>
  )
}

function ConversationList({
  conversations,
  onSelect,
  onClose,
}: {
  conversations: Array<DmConversation> | null
  onSelect: (c: DmConversation) => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Messages</h2>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            nativeButton={false}
            render={<Link to="/inbox/new" onClick={onClose} />}
          >
            <NotePencilIcon size={16} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <XIcon size={16} />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!conversations && (
          <p className="p-4 text-sm text-muted-foreground">loading...</p>
        )}
        {conversations && conversations.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            no conversations yet
          </p>
        )}
        {conversations && conversations.length > 0 && (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <ConversationRow conversation={c} onClick={() => onSelect(c)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ConversationRow({
  conversation,
  onClick,
}: {
  conversation: DmConversation
  onClick: () => void
}) {
  const title = conversation.title || defaultTitle(conversation)
  const preview =
    conversation.lastMessage?.text ??
    previewForKind(conversation.lastMessage?.kind)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/20"
    >
      <ConversationAvatar conversation={conversation} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {preview ?? "no messages yet"}
        </p>
      </div>
      {conversation.unreadCount > 0 && (
        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {conversation.unreadCount}
        </span>
      )}
    </button>
  )
}

function ChatView({
  conversation,
  onBack,
  onClose,
}: {
  conversation: DmConversation
  onBack: () => void
  onClose: () => void
}) {
  const { me } = useMe()
  const [messages, setMessages] = useState<Array<DmMessage>>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<{
    file: File
    previewUrl: string
  } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl)
    }
  }, [pending])

  const title = conversation.title || defaultTitle(conversation)

  useEffect(() => {
    let cancel = false

    async function load() {
      setLoading(true)
      try {
        const { messages: next } = await api.dmMessages(conversation.id)
        if (!cancel) setMessages(next.reverse())
      } catch {
        // ignore
      } finally {
        if (!cancel) setLoading(false)
      }
    }

    load()
    // mark as read
    api.dmMarkRead(conversation.id).catch(() => {})

    const unsubscribe = subscribeToDmStream((event) => {
      if (event.conversationId !== conversation.id) return
      if (event.type === "message") {
        setMessages((prev) => [...prev, event.message])
        api.dmMarkRead(conversation.id).catch(() => {})
      }
    })

    return () => {
      cancel = true
      unsubscribe()
    }
  }, [conversation.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if ((!trimmed && !pending) || sending) return

    setSending(true)
    try {
      let mediaId: string | undefined
      if (pending) {
        const media = await uploadImage(pending.file)
        mediaId = media.id
      }
      const { message } = await api.dmSend(conversation.id, {
            text: trimmed || undefined,
            mediaId,
          })
      setMessages((prev) => [...prev, message])
      setText("")
      clearPending()
      inputRef.current?.focus()
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  function attachFile(file: File) {
    if (!file.type.startsWith("image/")) return
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending({ file, previewUrl: URL.createObjectURL(file) })
  }

  function clearPending() {
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) attachFile(file)
  }

  function onDragOver(e: React.DragEvent) {
    if (sending) return
    if (!Array.from(e.dataTransfer.types).includes("Files")) return
    e.preventDefault()
    setDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files.item(0)
    if (file) attachFile(file)
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (sending) return
    const files = getPastedImageFiles(e)
    if (files.length === 0) return
    e.preventDefault()
    attachFile(files[0])
  }

  return (
    <div
      className="relative flex h-[32rem] max-h-[calc(100vh-6rem)] flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-foreground">
          Drop image to attach
        </div>
      )}
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Button size="icon-sm" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon size={18} />
        </Button>
        <span className="flex-1 truncate text-sm font-semibold">{title}</span>
        <Button size="icon-sm" variant="ghost" onClick={onClose}>
          <XIcon size={16} />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            loading...
          </p>
        ) : messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            no messages yet
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <div key={msg.id}>
                <MessageBubble message={msg} isMe={msg.senderId === me?.id} />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {pending && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <div className="relative">
            <img
              src={pending.previewUrl}
              alt="attachment preview"
              className="size-14 rounded-md border border-border object-cover"
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
          <span className="text-xs text-muted-foreground">
            {sending ? "sending…" : "attached"}
          </span>
        </div>
      )}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-1 border-t border-border px-2 py-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
        >
          <ImageIcon size={18} />
        </Button>
        <Input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder={pending ? "Add a caption…" : "Message..."}
          disabled={sending}
          className="flex-1 border-0 bg-transparent"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          disabled={(!text.trim() && !pending) || sending}
        >
          <PaperPlaneTiltIcon size={18} />
        </Button>
      </form>
    </div>
  )
}

function MessageBubble({
  message,
  isMe,
}: {
  message: DmMessage
  isMe: boolean
}) {
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          isMe ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {!isMe && message.sender && (
          <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
            {message.sender.displayName || `@${message.sender.handle}`}
          </p>
        )}
        {message.media && (
          <img
            src={message.media.variants[0]?.url}
            alt=""
            className="mb-1 max-h-40 rounded-lg object-cover"
          />
        )}
        {message.text && (
          <p className="text-sm break-words whitespace-pre-wrap">
            {message.text}
          </p>
        )}
        <p
          className={`mt-0.5 text-[10px] ${
            isMe ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {time}
        </p>
      </div>
    </div>
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
      <div className="relative size-9 shrink-0">
        {a && (
          <Avatar
            initial={initialFor(a)}
            src={a.avatarUrl}
            className="absolute top-0 left-0 size-6 ring-2 ring-background"
          />
        )}
        {b && (
          <Avatar
            initial={initialFor(b)}
            src={b.avatarUrl}
            className="absolute right-0 bottom-0 size-6 ring-2 ring-background"
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
      className="size-9"
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
