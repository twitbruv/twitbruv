import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChartBarIcon,
  ImageIcon,
  UsersIcon,
  XIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX_LEN,
  POST_MAX_LEN,
} from "@workspace/validators"
import { ApiError, api } from "../lib/api"
import { setAltText, uploadImage } from "../lib/media"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { clearDraft, draftKey, loadDraft, saveDraft } from "../lib/drafts"
import { useMe } from "../lib/me"
import { VerifiedBadge } from "./verified-badge"
import type { PollInput, Post } from "../lib/api"
import type { UploadedMedia } from "../lib/media"

const MAX_ATTACHMENTS = 4

interface PollOption {
  id: string
  value: string
}

interface PollDraft {
  options: Array<PollOption>
  durationMinutes: number
  allowMultiple: boolean
}

function createPollOption(value = ""): PollOption {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    value,
  }
}

const POLL_DURATION_CHOICES: Array<{ label: string; minutes: number }> = [
  { label: "5 minutes", minutes: 5 },
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 60 * 24 },
  { label: "3 days", minutes: 60 * 24 * 3 },
  { label: "7 days", minutes: 60 * 24 * 7 },
]

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
  collapsible = false,
}: {
  onCreated?: (post: Post) => void
  replyToId?: string
  quoteOfId?: string
  /** When quoting, render a summary of the quoted post so the author knows what's attached. */
  quoted?: Post
  placeholder?: string
  /** When true, render a single-line collapsed view until the user focuses the input. */
  collapsible?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { me } = useMe()
  const dKey = useMemo(
    () => draftKey({ replyToId, quoteOfId }),
    [replyToId, quoteOfId]
  )
  const [text, setText] = useState(() => loadDraft(dKey))
  const [expanded, setExpanded] = useState(
    () => !collapsible || loadDraft(dKey).length > 0
  )
  // Persist drafts on every keystroke. Tiny localStorage write — fine without debouncing.
  useEffect(() => {
    saveDraft(dKey, text)
  }, [dKey, text])
  const [attachments, setAttachments] = useState<Array<PendingAttachment>>([])
  const [poll, setPoll] = useState<PollDraft | null>(null)
  const [loading, setLoading] = useState(false)
  // Replies inherit their thread's restriction; only let the user pick on
  // top-level posts and quotes (which start a new thread).
  const [replyRestriction, setReplyRestriction] = useState<
    "anyone" | "following" | "mentioned"
  >("anyone")
  const showReplyControl = !replyToId
  const avatarInitial = (me?.displayName ?? me?.handle ?? "·")
    .slice(0, 1)
    .toUpperCase()

  const remaining = POST_MAX_LEN - text.length
  const readyMediaIds = attachments
    .filter((a) => a.status === "ready" && a.media)
    .map((a) => a.media!.id)
  const pollValid =
    !poll ||
    (poll.options.filter((o) => o.value.trim().length > 0).length >=
      POLL_MIN_OPTIONS &&
      poll.options.every((o) => o.value.length <= POLL_OPTION_MAX_LEN))
  const hasContent =
    text.trim().length > 0 ||
    readyMediaIds.length > 0 ||
    Boolean(quoteOfId) ||
    Boolean(poll)
  const noneUploading = attachments.every((a) => a.status !== "uploading")
  const canSubmit =
    hasContent && remaining >= 0 && noneUploading && pollValid && !loading

  function startPoll() {
    if (poll) return
    setPoll({
      options: [createPollOption(), createPollOption()],
      durationMinutes: 60 * 24,
      allowMultiple: false,
    })
  }
  function updatePollOption(id: string, value: string) {
    if (!poll) return
    setPoll({
      ...poll,
      options: poll.options.map((opt) =>
        opt.id === id ? { ...opt, value } : opt
      ),
    })
  }
  function addPollOption() {
    if (!poll || poll.options.length >= POLL_MAX_OPTIONS) return
    setPoll({ ...poll, options: [...poll.options, createPollOption()] })
  }
  function removePollOption(id: string) {
    if (!poll) return
    if (poll.options.length <= POLL_MIN_OPTIONS) return
    setPoll({
      ...poll,
      options: poll.options.filter((opt) => opt.id !== id),
    })
  }

  async function addFiles(files: FileList | ReadonlyArray<File> | null) {
    if (files == null) return
    const room = MAX_ATTACHMENTS - attachments.length
    const incoming = (Array.isArray(files) ? files : Array.from(files)).slice(
      0,
      room
    )
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
    setLoading(true)
    try {
      // Push alt text just before send. Best-effort — failures don't block the post itself.
      await Promise.all(
        attachments
          .filter(
            (a) =>
              a.status === "ready" && a.media && a.altText.trim().length > 0
          )
          .map((a) => setAltText(a.media!.id, a.altText).catch(() => {}))
      )
      const pollPayload: PollInput | undefined = poll
        ? {
            options: poll.options
              .map((o) => o.value.trim())
              .filter((o) => o.length > 0),
            durationMinutes: poll.durationMinutes,
            allowMultiple: poll.allowMultiple,
          }
        : undefined
      const { post } = await api.createPost({
        text: text.trim(),
        replyToId,
        quoteOfId,
        mediaIds: readyMediaIds.length > 0 ? readyMediaIds : undefined,
        poll: pollPayload,
        replyRestriction: showReplyControl ? replyRestriction : undefined,
      })
      setText("")
      clearDraft(dKey)
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl))
      setAttachments([])
      setPoll(null)
      if (collapsible) setExpanded(false)
      onCreated?.(post)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "failed to post")
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

  function onPaste(e: React.ClipboardEvent) {
    if (attachments.length >= MAX_ATTACHMENTS) return
    const files = getPastedImageFiles(e)
    if (files.length === 0) return
    e.preventDefault()
    void addFiles(files)
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
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setExpanded(true)}
          onPaste={onPaste}
          placeholder={placeholder}
          rows={expanded ? 3 : 1}
          className="min-h-0 border-0 bg-transparent px-0 py-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
        />

        {quoted && (
          <div className="mt-2 rounded-md border border-border p-3 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground">
                {quoted.author.displayName ||
                  `@${quoted.author.handle ?? "unknown"}`}
                {quoted.author.isVerified && (
                  <VerifiedBadge size={13} role={quoted.author.role} />
                )}
              </span>
              {quoted.author.handle && <span>@{quoted.author.handle}</span>}
            </div>
            <p className="mt-1 line-clamp-3 break-words whitespace-pre-wrap">
              {quoted.text}
            </p>
          </div>
        )}

        {poll && (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Poll
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPoll(null)}
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              >
                Remove
              </Button>
            </div>
            {poll.options.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                <Input
                  value={opt.value}
                  onChange={(e) => updatePollOption(opt.id, e.target.value)}
                  placeholder={`Choice ${idx + 1}`}
                  maxLength={POLL_OPTION_MAX_LEN}
                  className="h-8 flex-1 text-sm"
                />
                {poll.options.length > POLL_MIN_OPTIONS && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removePollOption(opt.id)}
                    aria-label="remove option"
                  >
                    <XIcon size={14} />
                  </Button>
                )}
              </div>
            ))}
            {poll.options.length < POLL_MAX_OPTIONS && (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={addPollOption}
                className="h-auto w-fit p-0 text-xs"
              >
                Add choice
              </Button>
            )}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Label className="shrink-0 text-xs text-muted-foreground">
                  Duration
                </Label>
                <Select
                  value={String(poll.durationMinutes)}
                  onValueChange={(v) =>
                    setPoll({ ...poll, durationMinutes: Number(v) })
                  }
                >
                  <SelectTrigger size="sm" className="h-7 min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLL_DURATION_CHOICES.map((c) => (
                      <SelectItem key={c.minutes} value={String(c.minutes)}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="poll-multi"
                  className="text-xs text-muted-foreground"
                >
                  Multiple choice
                </Label>
                <Switch
                  id="poll-multi"
                  checked={poll.allowMultiple}
                  onCheckedChange={(v) =>
                    setPoll({ ...poll, allowMultiple: v })
                  }
                  size="sm"
                />
              </div>
            </div>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <div key={a.tempId} className="flex flex-col gap-1">
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
                    <XIcon size={14} />
                  </Button>
                </div>
                <Input
                  value={a.altText}
                  onChange={(e) =>
                    setAttachments((prev) =>
                      prev.map((x) =>
                        x.tempId === a.tempId
                          ? { ...x, altText: e.target.value }
                          : x
                      )
                    )
                  }
                  disabled={a.status !== "ready"}
                  placeholder="Alt text (screen readers)"
                  maxLength={1000}
                  className="h-7 text-xs disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        )}

        {expanded && (
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
                disabled={
                  attachments.length >= MAX_ATTACHMENTS || Boolean(poll)
                }
                onClick={() => fileInputRef.current?.click()}
                aria-label="add image"
              >
                <ImageIcon size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={
                  Boolean(poll) ||
                  attachments.length > 0 ||
                  Boolean(replyToId) ||
                  Boolean(quoteOfId)
                }
                onClick={startPoll}
                aria-label="add poll"
                title="Add a poll"
              >
                <ChartBarIcon size={18} />
              </Button>
              {showReplyControl && (
                <div
                  className="flex max-w-[min(100%,12rem)] min-w-0 items-center gap-1.5"
                  title="Who can reply"
                >
                  <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <Select
                    value={replyRestriction}
                    onValueChange={(v) =>
                      setReplyRestriction(
                        v as "anyone" | "following" | "mentioned"
                      )
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 min-w-0 flex-1 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anyone">Everyone can reply</SelectItem>
                      <SelectItem value="following">
                        People you follow
                      </SelectItem>
                      <SelectItem value="mentioned">
                        Only people you @mention
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <span
                className={`text-xs tabular-nums ${
                  remaining < 0
                    ? "text-destructive"
                    : remaining < 20
                      ? "text-foreground/80"
                      : "text-muted-foreground"
                }`}
              >
                {remaining}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={!canSubmit} size="lg">
                {loading
                  ? "Posting…"
                  : replyToId
                    ? "Reply"
                    : quoteOfId
                      ? "Quote"
                      : "Post"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
