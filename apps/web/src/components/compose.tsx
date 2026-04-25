import { useEffect, useMemo, useRef, useState } from "react"
import { IconPhoto, IconX } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { POST_MAX_LEN } from "@workspace/validators"
import { ApiError, api } from "../lib/api"
import { setAltText, uploadImage } from "../lib/media"
import { clearDraft, draftKey, loadDraft, saveDraft } from "../lib/drafts"
import { useMe } from "../lib/me"
import { VerifiedBadge } from "./verified-badge"
import type { Post } from "../lib/api"
import type { UploadedMedia } from "../lib/media"

const MAX_ATTACHMENTS = 4

interface PendingAttachment {
  tempId: string
  status: "uploading" | "ready" | "failed"
  previewUrl: string
  media?: UploadedMedia
  altText: string
  error?: string
}

export function Compose({
  onCreated,
  replyToId,
  quoteOfId,
  quoted,
  placeholder = "What's happening?",
}: {
  onCreated?: (post: Post) => void
  replyToId?: string
  quoteOfId?: string
  /** When quoting, render a summary of the quoted post so the author knows what's attached. */
  quoted?: Post
  placeholder?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { me } = useMe()
  const dKey = useMemo(() => draftKey({ replyToId, quoteOfId }), [replyToId, quoteOfId])
  const [text, setText] = useState(() => loadDraft(dKey))
  // Persist drafts on every keystroke. Tiny localStorage write — fine without debouncing.
  useEffect(() => {
    saveDraft(dKey, text)
  }, [dKey, text])
  const [attachments, setAttachments] = useState<Array<PendingAttachment>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const avatarInitial = (me?.displayName ?? me?.handle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  const remaining = POST_MAX_LEN - text.length
  const readyMediaIds = attachments
    .filter((a) => a.status === "ready" && a.media)
    .map((a) => a.media!.id)
  const hasContent =
    text.trim().length > 0 || readyMediaIds.length > 0 || Boolean(quoteOfId)
  const noneUploading = attachments.every((a) => a.status !== "uploading")
  const canSubmit = hasContent && remaining >= 0 && noneUploading && !loading

  async function addFiles(files: FileList | null) {
    if (!files) return
    const room = MAX_ATTACHMENTS - attachments.length
    const incoming = Array.from(files).slice(0, room)
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue
      const tempId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      setAttachments((prev) => [
        ...prev,
        { tempId, status: "uploading", previewUrl, altText: "" },
      ])
      try {
        const media = await uploadImage(file)
        setAttachments((prev) =>
          prev.map((a) =>
            a.tempId === tempId ? { ...a, status: "ready", media } : a
          )
        )
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.tempId === tempId
              ? {
                  ...a,
                  status: "failed",
                  error: e instanceof Error ? e.message : "upload failed",
                }
              : a
          )
        )
      }
    }
  }

  function removeAttachment(tempId: string) {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.tempId !== tempId)
      const removed = prev.find((a) => a.tempId === tempId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return next
    })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setLoading(true)
    try {
      // Push alt text just before send. Best-effort — failures don't block the post itself.
      await Promise.all(
        attachments
          .filter((a) => a.status === "ready" && a.media && a.altText.trim().length > 0)
          .map((a) => setAltText(a.media!.id, a.altText).catch(() => {})),
      )
      const { post } = await api.createPost({
        text: text.trim(),
        replyToId,
        quoteOfId,
        mediaIds: readyMediaIds.length > 0 ? readyMediaIds : undefined,
      })
      setText("")
      clearDraft(dKey)
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
      setAttachments([])
      onCreated?.(post)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "failed to post")
    } finally {
      setLoading(false)
    }
  }

  function onDragOver(e: React.DragEvent) {
    if (attachments.length >= MAX_ATTACHMENTS) return
    e.preventDefault()
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  return (
    <form
      onSubmit={onSubmit}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex gap-3 border-b border-border px-4 py-4"
    >
      <div className="size-10 shrink-0 overflow-hidden rounded-full">
        {me?.avatarUrl ? (
          <img
            src={me.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-foreground/80 uppercase">
            {avatarInitial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none"
        />

        {quoted && (
          <div className="mt-2 rounded-md border border-border p-3 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground">
                {quoted.author.displayName || `@${quoted.author.handle ?? "unknown"}`}
                {quoted.author.isVerified && <VerifiedBadge size={13} />}
              </span>
              {quoted.author.handle && <span>@{quoted.author.handle}</span>}
            </div>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words">{quoted.text}</p>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <div key={a.tempId} className="space-y-1">
                <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                  <img
                    src={a.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  {a.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 text-xs text-muted-foreground">
                      uploading…
                    </div>
                  )}
                  {a.status === "failed" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 p-2 text-center text-xs text-destructive">
                      {a.error ?? "failed"}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAttachment(a.tempId)}
                    aria-label="remove attachment"
                  >
                    <IconX size={14} />
                  </Button>
                </div>
                <input
                  value={a.altText}
                  onChange={(e) =>
                    setAttachments((prev) =>
                      prev.map((x) =>
                        x.tempId === a.tempId ? { ...x, altText: e.target.value } : x,
                      ),
                    )
                  }
                  disabled={a.status !== "ready"}
                  placeholder="Describe for screen readers"
                  maxLength={1000}
                  className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ""
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={attachments.length >= MAX_ATTACHMENTS}
              onClick={() => fileInputRef.current?.click()}
              aria-label="add image"
            >
              <IconPhoto size={18} stroke={1.75} />
            </Button>
            <span
              className={`text-xs ${
                remaining < 0
                  ? "text-destructive"
                  : remaining < 20
                    ? "text-amber-600"
                    : "text-muted-foreground"
              }`}
            >
              {remaining}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-destructive">{error}</span>}
            <Button type="submit" disabled={!canSubmit} size="lg">
              {loading ? "Posting…" : replyToId ? "Reply" : quoteOfId ? "Quote" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
