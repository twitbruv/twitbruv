import { useRef, useState } from "react"
import { ImageIcon, XIcon } from "@phosphor-icons/react"
import { Button } from "@workspace/ui/components/button"
import { getPastedImageFiles } from "../lib/clipboard-images"
import { compressImage, uploadImage } from "../lib/media"

/**
 * Single-image cover picker. Hands the parent the resulting media id once upload finishes.
 * Initial preview can be supplied (for the edit page where a cover already exists).
 */
export function CoverPicker({
  initialUrl = null,
  onChange,
}: {
  initialUrl?: string | null
  onChange: (mediaId: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(initialUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function pick(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("only image files")
      return
    }
    setBusy(true)
    setError(null)
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    try {
      const compressed = await compressImage(file)
      const uploaded = await uploadImage(compressed)
      onChange(uploaded.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed")
      setPreview(initialUrl)
    } finally {
      URL.revokeObjectURL(localUrl)
      setBusy(false)
    }
  }

  function clear() {
    setPreview(null)
    onChange(null)
  }

  function onDragOver(e: React.DragEvent) {
    if (busy) return
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
    if (file) pick(file)
  }

  function onPaste(e: React.ClipboardEvent) {
    if (busy) return
    const files = getPastedImageFiles(e)
    if (files.length === 0) return
    e.preventDefault()
    pick(files[0])
  }

  return (
    <div
      className="space-y-1"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick(file)
          e.target.value = ""
        }}
      />
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="cover preview"
            className="aspect-[3/1] w-full rounded-md object-cover"
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={clear}
            aria-label="remove cover"
            className="absolute top-2 right-2 size-7 rounded-full bg-background/80 backdrop-blur-sm"
          >
            <XIcon size={14} />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className={`flex aspect-[3/1] w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs transition ${
            dragOver
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted/30"
          }`}
        >
          <ImageIcon size={20} />
          <span>
            {busy
              ? "uploading…"
              : dragOver
                ? "Drop to upload"
                : "Add cover image"}
          </span>
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
