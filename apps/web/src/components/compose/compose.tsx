import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { Avatar } from "@workspace/ui/components/avatar"
import { LinkCard } from "@workspace/ui/components/link-card"
import { Spinner } from "@workspace/ui/components/spinner"
import { POST_MAX_LEN } from "@workspace/validators"
import { api } from "../../lib/api"
import { setAltText, uploadImage } from "../../lib/media"
import { getPastedImageFiles } from "../../lib/clipboard-images"
import { clearDraft, draftKey, loadDraft, saveDraft } from "../../lib/drafts"
import { useMe } from "../../lib/me"
import { ComposePoll } from "./compose-poll"
import { ComposeAttachments } from "./compose-attachments"
import { ComposeDropZone } from "./compose-drop-zone"
import { ComposeActionBar } from "./compose-action-bar"
import { useLinkPreview } from "./use-link-preview"
import {
  MAX_ATTACHMENTS,
  createId,
  createPollOption,
  resizeTextarea,
} from "./types"
import type { PollInput } from "../../lib/api"
import type { ComposeProps, PendingAttachment, PollState } from "./types"

export function Compose({
  onCreated,
  replyToId,
  quoteOfId,
  quoted,
  placeholder = "What's happening?",
  collapsible = false,
  autoFocus = false,
}: ComposeProps) {
  const { me } = useMe()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const dKey = useMemo(
    () => draftKey({ replyToId, quoteOfId }),
    [replyToId, quoteOfId]
  )

  const [text, setText] = useState(() => loadDraft(dKey))
  const [expanded, setExpanded] = useState(
    () => !collapsible || loadDraft(dKey).length > 0
  )
  const [attachments, setAttachments] = useState<Array<PendingAttachment>>([])
  const [poll, setPoll] = useState<PollState | null>(null)
  const [loading, setLoading] = useState(false)
  const [replyRestriction, setReplyRestriction] = useState<
    "anyone" | "following" | "mentioned"
  >("anyone")
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(
    null
  )
  const [isDragging, setIsDragging] = useState(false)
  const showReplyControl = !replyToId
  const { preview: linkPreview, loading: linkPreviewLoading } =
    useLinkPreview(text)

  useEffect(() => {
    saveDraft(dKey, text)
  }, [dKey, text])

  useEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [text, expanded])

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  // ── Derived state ──────────────────────────────────────────────────

  const readyMediaIds = attachments
    .filter((a) => a.status === "ready" && a.media)
    .map((a) => a.media!.id)

  const pollValid =
    !poll ||
    (poll.options.filter((o) => o.value.trim().length > 0).length >= 2 &&
      poll.options.every((o) => o.value.length <= 100))

  const hasContent =
    text.trim().length > 0 ||
    readyMediaIds.length > 0 ||
    Boolean(quoteOfId) ||
    Boolean(poll)

  const isComposeEmpty =
    text.trim().length === 0 && attachments.length === 0 && !quoteOfId && !poll

  const noneUploading = attachments.every((a) => a.status !== "uploading")
  const canSubmit =
    hasContent &&
    POST_MAX_LEN - text.length >= 0 &&
    noneUploading &&
    pollValid &&
    !loading

  useEffect(() => {
    if (!collapsible) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (!isComposeEmpty) return
      setExpanded(false)
      textareaRef.current?.blur()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [collapsible, isComposeEmpty])

  useEffect(() => {
    if (!collapsible) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (!target || !formRef.current) return
      if (formRef.current.contains(target)) return
      if (target.closest('[role="menu"], [role="dialog"], [role="listbox"]'))
        return
      if (!isComposeEmpty) return
      setExpanded(false)
      textareaRef.current?.blur()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [collapsible, isComposeEmpty])

  // ── Handlers ───────────────────────────────────────────────────────

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value)
      if (collapsible) setExpanded(true)
    },
    [collapsible]
  )

  const addFiles = useCallback(
    async (files: FileList | ReadonlyArray<File> | null) => {
      if (!files) return
      const incoming = (Array.isArray(files) ? files : Array.from(files)).slice(
        0,
        MAX_ATTACHMENTS - attachments.length
      )

      for (const file of incoming) {
        if (!file.type.startsWith("image/")) continue
        const tempId = createId()
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
    },
    [attachments.length]
  )

  const removeAttachment = useCallback((tempId: string) => {
    setAttachments((prev) =>
      prev.map((a) => (a.tempId === tempId ? { ...a, removing: true } : a))
    )
    setTimeout(() => {
      setAttachments((prev) => {
        const removed = prev.find((a) => a.tempId === tempId)
        if (removed) URL.revokeObjectURL(removed.previewUrl)
        return prev.filter((a) => a.tempId !== tempId)
      })
    }, 200)
  }, [])

  const startPoll = useCallback(() => {
    if (poll) return
    setPoll({
      options: [createPollOption(), createPollOption()],
      durationMinutes: 60 * 24,
      allowMultiple: false,
    })
  }, [poll])

  const addPollOption = useCallback(() => {
    setPoll((p) => {
      if (!p || p.options.length >= 4) return p
      return { ...p, options: [...p.options, createPollOption()] }
    })
  }, [])

  const updatePollOption = useCallback((id: string, value: string) => {
    setPoll((p) =>
      p
        ? {
            ...p,
            options: p.options.map((o) => (o.id === id ? { ...o, value } : o)),
          }
        : null
    )
  }, [])

  const removePollOption = useCallback((id: string) => {
    setPoll((p) => {
      if (!p || p.options.length <= 2) return p
      return { ...p, options: p.options.filter((o) => o.id !== id) }
    })
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return
      setLoading(true)
      try {
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
        textareaRef.current?.blur()
        if (collapsible) setExpanded(false)
        onCreated?.(post)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "failed to post")
      } finally {
        setLoading(false)
      }
    },
    [
      canSubmit,
      attachments,
      poll,
      text,
      replyToId,
      quoteOfId,
      readyMediaIds,
      showReplyControl,
      replyRestriction,
      dKey,
      collapsible,
      onCreated,
    ]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (canSubmit) {
          const fakeEvent = new Event("submit", {
            bubbles: true,
          }) as unknown as React.FormEvent
          handleSubmit(fakeEvent)
        }
      }
    },
    [canSubmit, handleSubmit]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (attachments.length >= MAX_ATTACHMENTS) return
      const files = getPastedImageFiles(e)
      if (files.length === 0) return
      e.preventDefault()
      void addFiles(files)
    },
    [attachments.length, addFiles]
  )

  // ── Drag listeners ────────────────────────────────────────────────
  // Collapsible (inline) composer: window-level drag so dropping anywhere works.
  // Non-collapsible (modal) composer: form-level drag only — prevents the
  // background inline composer from reacting when the modal is open.

  useEffect(() => {
    if (!collapsible) return // modal uses form-level handlers
    function hasOpenDialog() {
      return Boolean(document.querySelector("[role=dialog]"))
    }
    function onDragEnter(e: DragEvent) {
      if (hasOpenDialog()) return
      if (attachments.length >= MAX_ATTACHMENTS) return
      if (!e.dataTransfer?.types.includes("Files")) return
      e.preventDefault()
      setIsDragging(true)
      setExpanded(true)
    }
    function onDragOver(e: DragEvent) {
      if (hasOpenDialog()) return
      if (attachments.length >= MAX_ATTACHMENTS) return
      e.preventDefault()
    }
    function onDragLeave(e: DragEvent) {
      if (hasOpenDialog()) return
      if (!e.relatedTarget) setIsDragging(false)
    }
    function onDrop(e: DragEvent) {
      if (hasOpenDialog()) return
      if (attachments.length >= MAX_ATTACHMENTS) return
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files)
    }
    window.addEventListener("dragenter", onDragEnter)
    window.addEventListener("dragover", onDragOver)
    window.addEventListener("dragleave", onDragLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onDragEnter)
      window.removeEventListener("dragover", onDragOver)
      window.removeEventListener("dragleave", onDragLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [attachments.length, addFiles, collapsible])

  // Form-level drag handlers for modal composer
  const handleFormDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (collapsible) return // inline uses window-level
      if (attachments.length >= MAX_ATTACHMENTS) return
      if (!e.dataTransfer.types.includes("Files")) return
      e.preventDefault()
      setIsDragging(true)
    },
    [collapsible, attachments.length]
  )
  const handleFormDragOver = useCallback(
    (e: React.DragEvent) => {
      if (collapsible) return
      if (attachments.length >= MAX_ATTACHMENTS) return
      e.preventDefault()
    },
    [collapsible, attachments.length]
  )
  const handleFormDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (collapsible) return
      // Only set false if leaving the form entirely
      if (
        formRef.current &&
        !formRef.current.contains(e.relatedTarget as Node)
      ) {
        setIsDragging(false)
      }
    },
    [collapsible]
  )
  const handleFormDrop = useCallback(
    (e: React.DragEvent) => {
      if (collapsible) return
      if (attachments.length >= MAX_ATTACHMENTS) return
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    },
    [collapsible, attachments.length, addFiles]
  )

  // ── Render helpers ─────────────────────────────────────────────────

  function buttonLabel(): string {
    if (loading) return "Posting…"
    if (replyToId) return "Reply"
    if (quoteOfId) return "Quote"
    return "Post"
  }

  // Build quoted post thumbnail
  const quotedThumb = quoted?.media?.find(
    (m) => m.processingState === "ready" && m.variants.length > 0
  )
  const quotedThumbUrl =
    quotedThumb?.variants.find((v) => v.kind === "thumb")?.url ??
    quotedThumb?.variants.find((v) => v.kind === "medium")?.url ??
    quotedThumb?.variants[0]?.url

  return (
    <>
      {/* Fullscreen overlay behind composer */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-40 transition-[opacity,transform] duration-200 ease-out-expo",
          isDragging && attachments.length < MAX_ATTACHMENTS
            ? "scale-100 opacity-100"
            : "scale-95 opacity-0"
        )}
      >
        <div className="h-full w-full bg-base-1/80" />
      </div>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onDragEnter={handleFormDragEnter}
        onDragOver={handleFormDragOver}
        onDragLeave={handleFormDragLeave}
        onDrop={handleFormDrop}
        className={cn("relative flex gap-3 px-4 py-3", isDragging && "z-50")}
      >
        {/* Avatar */}
        <div className="shrink-0">
          <Avatar
            initial={
              (me?.displayName ?? me?.handle ?? "·")
                .slice(0, 1)
                .toUpperCase() || "·"
            }
            src={me?.avatarUrl}
            size="lg"
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (collapsible) setExpanded(true)
            }}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
            maxLength={POST_MAX_LEN * 2}
            className="w-full resize-none bg-transparent pt-2 text-[15px] leading-relaxed text-primary outline-none placeholder:text-tertiary"
          />

          {/* Poll */}
          {poll && (
            <ComposePoll
              poll={poll}
              onRemove={() => setPoll(null)}
              onAddOption={addPollOption}
              onUpdateOption={updatePollOption}
              onRemoveOption={removePollOption}
              onSetDuration={(minutes) =>
                setPoll((p) => (p ? { ...p, durationMinutes: minutes } : null))
              }
              onSetAllowMultiple={(v) =>
                setPoll((p) => (p ? { ...p, allowMultiple: v } : null))
              }
            />
          )}

          {/* Attachments */}
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out-expo",
              attachments.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            <div
              className={cn(
                "min-h-0 overflow-hidden",
                attachments.length === 0 && "pointer-events-none"
              )}
            >
              <ComposeAttachments
                attachments={attachments}
                editingAttachmentId={editingAttachmentId}
                onSetEditingAttachmentId={setEditingAttachmentId}
                onUpdateAltText={(tempId, altText) =>
                  setAttachments((prev) =>
                    prev.map((a) =>
                      a.tempId === tempId ? { ...a, altText } : a
                    )
                  )
                }
                onRemoveAttachment={removeAttachment}
              />
            </div>
          </div>

          {/* Drop zone */}
          <ComposeDropZone
            isDragging={isDragging}
            attachmentCount={attachments.length}
          />

          {/* Link preview */}
          {linkPreviewLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-tertiary">
              <Spinner size="xs" />
              <span>Loading preview…</span>
            </div>
          )}
          {linkPreview && !linkPreviewLoading && (
            <LinkCard
              url={linkPreview.url}
              title={linkPreview.title}
              description={linkPreview.description}
              imageUrl={linkPreview.imageUrl}
              siteName={linkPreview.siteName}
              className="mt-0"
            />
          )}

          {/* Quoted post preview */}
          {quoted && (
            <div className="mt-2 overflow-hidden rounded-lg border border-neutral">
              <div className="flex gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-tertiary">
                    <span className="font-medium text-primary">
                      {quoted.author.displayName ??
                        `@${quoted.author.handle ?? "unknown"}`}
                    </span>
                    {quoted.author.handle && (
                      <span>@{quoted.author.handle}</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap text-primary">
                    {quoted.text}
                  </p>
                </div>
                {quotedThumbUrl && (
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg">
                    <img
                      src={quotedThumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action bar */}
          <ComposeActionBar
            expanded={expanded}
            fileInputRef={fileInputRef}
            attachmentsCount={attachments.length}
            hasPoll={Boolean(poll)}
            replyToId={replyToId}
            quoteOfId={quoteOfId}
            showReplyControl={showReplyControl}
            replyRestriction={replyRestriction}
            onSetReplyRestriction={setReplyRestriction}
            textLength={text.length}
            canSubmit={canSubmit}
            buttonLabel={buttonLabel()}
            onAddFiles={addFiles}
            onStartPoll={startPoll}
          />
        </div>
      </form>
    </>
  )
}
